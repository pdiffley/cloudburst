// import { Mutex } from "async-mutex";
import { jwtDecode } from "jwt-decode";
import { v4 as uuid } from "uuid";
import { AsyncMutex } from "@esfx/async-mutex";
import { QueryBuilder } from "./queryBuilder";

export { QueryBuilder } from "./queryBuilder";

type PrimaryKey = boolean | number | string;

interface FetchUpdatesResult {
  processedUpdates: GetUpdatesResponseRow[];
  unmatchedUpdates: GetUpdatesResponseRow[];
}

export interface QueryIdentifiers {
  activeTableName: string;
  conditions: [string, string][];
}

interface SubscribeToQueryRequest {
  clientId: string;
  queryIdentifiers: QueryIdentifiers;
  queryParams: Record<string, unknown>;
}
interface SubscribeToQueryResponse {
  subscriptionId: string;
  liveQueryId: string;
}

interface SubscriptionInitRequest {
  clientId: string;
  queryIdentifiers: QueryIdentifiers;
  queryParams: Record<string, unknown>;
  subscriptionId: string;
  liveQueryId: string;
}
type SubscriptionInitResponse =
  | "Unauthorized"
  | SubscriptionInitResponseSuccess;
interface SubscriptionInitResponseSuccess {
  success: {
    initialQueryData: {
      rowId: PrimaryKey;
      rowValue: Record<string, unknown>;
    }[];
  };
}

interface UnsubscribeQueryRequest {
  clientId: string;
  subscriptionId: string;
  liveQueryId: string;
  queryParams: Record<string, unknown>;
}
// type UnsubscribeQueryResponse = Record<string, never>;

type RegisterClientRequest = Record<string, never>;
interface RegisterClientResponse {
  clientId: string;
}

interface SubscriptionData {
  subscriptionId: string;
  liveQueryId: string;
  queryIdentifiers: QueryIdentifiers;
  queryParams: Record<string, unknown>;
  rows: Map<boolean | number | string, Record<string, unknown>>;
  callback: (newRows: readonly Record<string, unknown>[]) => void;
  errorCallback: (error: Error) => void;
  subscriptionStatus: SubscriptionStatus;
}

interface GetUpdatesRequest {
  clientId: string;
  confirmedUpdates?: ConfirmedMessageDetails[];
  confirmedCanceledSubscriptions?: string[];
}

interface ConfirmedMessageDetails {
  liveQueryId: string;
  subscriptionId: string;
  sourceRowId: PrimaryKey;
  updateId: string;
}

interface GetUpdatesResponse {
  updates?: GetUpdatesResponseRow[];
  subscriptionCancellations?: string[];
}

interface GetUpdatesResponseRow {
  subscriptionId: string;
  rowId: PrimaryKey;
  rowValue: Record<string, unknown> | null;
  updateId: string;
}

export interface UserAuthTokenResponse {
  userAuthToken: string;
}

interface SubscriptionStatus {
  unsubscribeHandleId: string;
  unsubscribed: boolean;
}

const SUBSCRIBE_QUERY_PATH = "/subscription";
const SUBSCRIPTION_INIT_PATH = "/subscription_init";
const UNSUBSCRIBE_QUERY_PATH = "/unsubscribe";
const GET_UPDATES_PATH = "/changes";
const REGISTER_CLIENT_PATH = "/client";

const AUTH_TOKEN_REFRESH_BUFFER_MILLIS = 5 * 60 * 1000;
const MIN_AUTH_TOKEN_REFRESH_INTERVAL_MILLIS = 10 * 1000;

export class Cloudburst {
  private clientId: string;
  private subscriptions: Map<string, SubscriptionData>;
  private unsubscribeHandleIdToSubscriptionIdMap: Map<string, string>;
  private updatesToConfirm: ConfirmedMessageDetails[];
  private subscriptionCancellationsToConfirm: string[];
  private registrationMutex: AsyncMutex;
  private apiUrl: string;
  private getAuthToken: () => Promise<UserAuthTokenResponse>;
  private authToken: string;
  private refreshAuthTokenMutex: AsyncMutex;
  private lastAuthRefreshTime: number;
  private abortController: AbortController;
  private isInitialized: boolean;

  private constructor(
    apiUrl: string,
    getAuthToken: () => Promise<UserAuthTokenResponse>,
  ) {
    this.clientId = "";
    this.subscriptions = new Map();
    this.unsubscribeHandleIdToSubscriptionIdMap = new Map();
    this.updatesToConfirm = [];
    this.subscriptionCancellationsToConfirm = [];
    this.registrationMutex = new AsyncMutex();
    this.apiUrl = apiUrl;
    this.getAuthToken = getAuthToken;
    this.authToken = "";
    this.refreshAuthTokenMutex = new AsyncMutex();
    this.lastAuthRefreshTime = 0;
    this.abortController = new AbortController();
    this.isInitialized = false;
  }

  static create(
    apiUrl: string,
    getAuthToken: () => Promise<UserAuthTokenResponse>,
  ): Cloudburst {
    const cloudburstClient = new Cloudburst(apiUrl, getAuthToken);

    cloudburstClient.start().catch((error: unknown) => {
      console.error(error);
    });

    return cloudburstClient;
  }

  async start() {
    await this.refreshAuthToken(this.authToken);
    await this.registerClient(this.clientId);
    this.isInitialized = true;
    this.loopAuthRefresh().catch((error: unknown) => {
      console.error(error);
    });
    this.loopUpdates().catch((error: unknown) => {
      console.error(error);
    });
  }

  dispose() {
    this.abortController.abort();
  }

  private async loopAuthRefresh() {
    while (!this.abortController.signal.aborted) {
      try {
        const initialAuthToken = this.authToken;
        const decodedToken = jwtDecode(initialAuthToken);
        let expiration = decodedToken.exp;
        expiration ??= 0;
        const now = Date.now();
        const refreshInterval =
          expiration * 1000 - AUTH_TOKEN_REFRESH_BUFFER_MILLIS - now;
        if (refreshInterval > 0) {
          await sleep(refreshInterval);
        }
        await this.refreshAuthToken(initialAuthToken);
      } catch (err: unknown) {
        console.error("error in loopAuthRefresh", err);
      }
    }
  }

  private async loopUpdates() {
    while (!this.abortController.signal.aborted) {
      try {
        await this.fetchUpdates();
      } catch (err: unknown) {
        console.error(err);
        await sleep(10_000);
      }
    }
  }

  // Todo: review name for callback and error callback
  subscribeQuery(
    queryIdentifiers: QueryIdentifiers,
    queryParams: Record<string, unknown>,
    callback: (newRows: readonly Record<string, unknown>[]) => void,
    errorCallback?: (error: Error) => void,
  ): () => void {
    const subscriptionStatus = {
      unsubscribeHandleId: uuid(),
      unsubscribed: false,
    };

    errorCallback ??= (_error: Error) => {
      /* empty */
    };

    this.subscribeQueryInner(
      subscriptionStatus,
      queryIdentifiers,
      queryParams,
      callback,
      errorCallback,
    ).catch(handleUnexpectedError("7a659b23-a60a-4312-9b5c-36b4538713e8"));

    const unsubscribeHandle = () => {
      const subscriptionId = this.unsubscribeHandleIdToSubscriptionIdMap.get(
        subscriptionStatus.unsubscribeHandleId,
      );
      if (subscriptionId) {
        // Todo: add a queue to retry this if it fails or run it in a loop?
        this.unsubscribeQuery(subscriptionId).catch(
          handleUnexpectedError("b275ee17-05a8-45da-859f-ce9ef49b9e5f"),
        );
      } else {
        subscriptionStatus.unsubscribed = true;
      }
    };
    return unsubscribeHandle;
  }

  // Todo: provide subscription error callback a typed error
  private async subscribeQueryInner(
    subscriptionStatus: SubscriptionStatus,
    queryIdentifiers: QueryIdentifiers,
    queryParams: Record<string, unknown>,
    callback: (newRows: readonly Record<string, unknown>[]) => void,
    errorCallback: (error: Error) => void,
  ): Promise<void> {
    await this.waitUntilInitialized();

    const subscribeRequest: SubscribeToQueryRequest = {
      clientId: this.clientId,
      queryIdentifiers,
      queryParams,
    };

    let subscribeResponse: SubscribeToQueryResponse;
    try {
      subscribeResponse = await this.makeApiRequest(
        `${this.apiUrl}${SUBSCRIBE_QUERY_PATH}`,
        subscribeRequest,
      );
    } catch (error) {
      // Todo: add retries for network errors.
      // Note: There is a small window here where a subscription could be stranded on
      //       the server. The odds of this are low relative to the expected lifetime
      //       of the client though and it will not result in client side errors
      errorCallback(
        new Error(`failed to subscribe to query: ${JSON.stringify(error)}`),
      );
      return;
    }

    // Add entry to subscriptions
    const subscriptionData: SubscriptionData = {
      subscriptionId: subscribeResponse.subscriptionId,
      liveQueryId: subscribeResponse.liveQueryId,
      queryIdentifiers,
      queryParams,
      rows: new Map(),
      callback,
      errorCallback: errorCallback,
      subscriptionStatus: subscriptionStatus,
    };

    this.subscriptions.set(subscribeResponse.subscriptionId, subscriptionData);
    this.unsubscribeHandleIdToSubscriptionIdMap.set(
      subscriptionStatus.unsubscribeHandleId,
      subscribeResponse.subscriptionId,
    );

    if (subscriptionStatus.unsubscribed) {
      this.unsubscribeQuery(subscribeResponse.subscriptionId).catch(
        handleUnexpectedError("77c612e6-8d12-46e0-8793-00c10dc0aacc"),
      );
      return;
    }

    const subscriptionInitRequest: SubscriptionInitRequest = {
      clientId: this.clientId,
      queryIdentifiers,
      queryParams,
      subscriptionId: subscriptionData.subscriptionId,
      liveQueryId: subscriptionData.liveQueryId,
    };

    let subscriptionInitResponse: SubscriptionInitResponse;
    try {
      // Todo: Add retries. In between retries, we should check if the subscription is unsubscribed
      subscriptionInitResponse = await this.makeApiRequest(
        `${this.apiUrl}${SUBSCRIPTION_INIT_PATH}`,
        subscriptionInitRequest,
      );
    } catch (error) {
      // Todo: should it be possible to hit this error, or should a retry mechanism keep going until success or unsubscription?
      this.failSubscription(
        subscribeResponse.subscriptionId,
        new Error(
          `Failed to initialize subscription: ${JSON.stringify(error)}`,
        ),
      );
      return;
    }

    if (subscriptionInitResponse === "Unauthorized") {
      this.failSubscription(
        subscribeResponse.subscriptionId,
        new Error("Failed to initialize subscription: Unauthorized"),
      );
      return;
    }

    const subscription = this.subscriptions.get(
      subscribeResponse.subscriptionId,
    );
    if (!subscription) {
      return;
    }
    for (const { rowId, rowValue } of subscriptionInitResponse.success
      .initialQueryData) {
      const row = subscription.rows.get(rowId);
      if (!row) {
        subscription.rows.set(rowId, rowValue);
      }
    }
    callbackSubscription(subscription);
  }

  // call a subscription's error callback, and remove the subscription
  failSubscription(subscriptionId: string, error: Error): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return;
    }
    subscription.errorCallback(error);
    this.unsubscribeQuery(subscriptionId).catch(
      handleUnexpectedError("1b8ba538-9cba-4b77-9750-4fc2a5a3c984"),
    );
  }

  async unsubscribeQuery(subscriptionId: string): Promise<void> {
    await this.waitUntilInitialized();

    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return;
    }
    const unsubscribeHandleId =
      subscription.subscriptionStatus.unsubscribeHandleId;
    this.subscriptions.delete(subscriptionId);
    this.unsubscribeHandleIdToSubscriptionIdMap.delete(unsubscribeHandleId);

    const liveQueryId = subscription.liveQueryId;
    const queryParams = subscription.queryParams;

    const unsubscribeRequest: UnsubscribeQueryRequest = {
      clientId: this.clientId,
      subscriptionId,
      liveQueryId,
      queryParams,
    };

    // Todo: retry this until it works?
    // Todo: do we want different status code/response body combinations for different failures?
    try {
      await this.makeApiRequest(
        `${this.apiUrl}${UNSUBSCRIBE_QUERY_PATH}`,
        unsubscribeRequest,
      );
    } catch (error: unknown) {
      console.error(
        `Cloudburst failed to unsubscribe from query: ${JSON.stringify(error)}`,
      );
    }
  }

  private async fetchUpdates(): Promise<FetchUpdatesResult> {
    await this.waitUntilInitialized();

    const getUpdatesRequest: GetUpdatesRequest = {
      clientId: this.clientId,
    };
    if (this.updatesToConfirm.length > 0) {
      getUpdatesRequest.confirmedUpdates = this.updatesToConfirm;
    }
    if (this.subscriptionCancellationsToConfirm.length > 0) {
      getUpdatesRequest.confirmedCanceledSubscriptions =
        this.subscriptionCancellationsToConfirm;
    }

    const responseBody: GetUpdatesResponse = await this.makeApiRequest(
      `${this.apiUrl}${GET_UPDATES_PATH}`,
      getUpdatesRequest,
    );
    this.updatesToConfirm = [];
    this.subscriptionCancellationsToConfirm = [];

    const updates = responseBody.updates;

    const unmatchedUpdates: GetUpdatesResponseRow[] = [];
    const processedUpdates: GetUpdatesResponseRow[] = [];

    const updatedSubscriptions = new Set<string>();
    if (updates) {
      for (const update of updates) {
        const subscription = this.subscriptions.get(update.subscriptionId);

        if (subscription) {
          // Todo: How does Option serialize?
          if (update.rowValue === null) {
            subscription.rows.delete(update.rowId);
          } else {
            subscription.rows.set(update.rowId, update.rowValue);
          }

          const messageConfirmation: ConfirmedMessageDetails = {
            liveQueryId: subscription.liveQueryId,
            subscriptionId: update.subscriptionId,
            sourceRowId: update.rowId,
            updateId: update.updateId,
          };
          this.updatesToConfirm.push(messageConfirmation);

          updatedSubscriptions.add(update.subscriptionId);
          processedUpdates.push(update);
        } else {
          unmatchedUpdates.push(update);
        }
      }
    }

    for (const subscriptionId of updatedSubscriptions) {
      const subscription = this.subscriptions.get(subscriptionId);
      if (subscription) {
        try {
          callbackSubscription(subscription);
        } catch (error: unknown) {
          console.error(
            `Cloudburst subscription callback failed with error: ${JSON.stringify(error)}`,
          );
        }
      }
    }
    if (responseBody.subscriptionCancellations) {
      for (const subscriptionId of responseBody.subscriptionCancellations) {
        this.failSubscription(
          subscriptionId,
          new Error("subscription canceled on change fetch"),
        );
        this.subscriptionCancellationsToConfirm.push(subscriptionId);
      }
    }

    return {
      processedUpdates,
      unmatchedUpdates,
    };
  }

  private async makeApiRequest<ResponseBody>(
    url: string,
    requestBody: unknown,
  ): Promise<ResponseBody> {
    let authRefreshAttempted = false;
    let registrationAttempted = false;
    let responseBody: "ClientNotFound" | { Success: ResponseBody };

    while (!this.abortController.signal.aborted) {
      const authToken = this.authToken;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(requestBody),
        signal: this.abortController.signal,
      });

      if (
        response.status === 403 &&
        (await response.text()) === "Invalid user auth token provided"
      ) {
        if (authRefreshAttempted) {
          throw new Error("Failed to refresh auth token for Cloudburst client");
        }
        authRefreshAttempted = true;

        await this.refreshAuthToken(authToken);
        continue;
      }

      if (response.status !== 200) {
        throw new Error(
          `Post ${url} failed with status: ${response.status.toString()}`,
        );
      }

      responseBody = (await response.json()) as typeof responseBody;

      if (responseBody === "ClientNotFound") {
        if (registrationAttempted) {
          throw new Error("Failed to register Cloudburst client");
        }
        registrationAttempted = true;

        await this.registerClient(this.clientId);
        continue;
      }

      return responseBody.Success;
    }
    throw new Error("Aborted");
  }

  private async registerClient(initialClientId: string) {
    const release = await this.registrationMutex.lock();
    // await this.registrationMutex.runExclusive(async () => {
    try {
      if (this.clientId !== initialClientId) {
        return;
      }
      const oldSubscriptions = this.subscriptions;
      this.subscriptions = new Map();
      this.unsubscribeHandleIdToSubscriptionIdMap = new Map();
      this.clientId = await this.makeRegisterClientRequest(this.apiUrl);
      for (const [
        _subscriptionId,
        subscription,
      ] of oldSubscriptions.entries()) {
        this.subscribeQueryInner(
          subscription.subscriptionStatus,
          subscription.queryIdentifiers,
          subscription.queryParams,
          subscription.callback,
          subscription.errorCallback,
        ).catch(
          handleUnexpectedError("83f68db1-f0c6-4316-8308-c32a813a5c7c"),
        );
      }
    } finally {
      release.unlock();
    }
  }

  private async makeRegisterClientRequest(apiUrl: string): Promise<string> {
    let authRefreshAttempted = false;
    const registerClientRequest: RegisterClientRequest = {};

    while (!this.abortController.signal.aborted) {
      const authToken = this.authToken;
      const response = await fetch(`${apiUrl}${REGISTER_CLIENT_PATH}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(registerClientRequest),
        signal: this.abortController.signal,
      });

      if (
        response.status === 403 &&
        (await response.text()) === "Invalid user auth token provided"
      ) {
        // Todo: Should this continue retrying?
        //   do we want the client create function to throw an exception
        if (authRefreshAttempted) {
          throw new Error("Failed to refresh auth token for Cloudburst client");
        }
        authRefreshAttempted = true;

        await this.refreshAuthToken(authToken);
        continue;
      }

      if (response.status !== 200) {
        throw new Error(
          `RegisterClientRequest failed with status: ${response.status.toString()}`,
        );
      }

      const responseBody = (await response.json()) as RegisterClientResponse;
      return responseBody.clientId;
    }
    throw new Error("Aborted");
  }

  private async refreshAuthToken(initialAuthToken: string) {
    const release = await this.refreshAuthTokenMutex.lock();

    try {
      if (this.authToken !== initialAuthToken) {
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      while (true) {
        const timeSinceLastRefresh = Date.now() - this.lastAuthRefreshTime;
        const delay =
          MIN_AUTH_TOKEN_REFRESH_INTERVAL_MILLIS - timeSinceLastRefresh;
        if (delay > 0) {
          await sleep(delay);
        }

        this.lastAuthRefreshTime = Date.now();
        try {
          this.authToken = (await this.getAuthToken()).userAuthToken;
        } catch (e) {
          console.error(
            "getAuthToken function provided to Cloudburst failed",
            e,
          );
          continue;
        }
        break;
      }
    } finally {
      release.unlock();
    }
  }

  setAuthTokenRefreshFunction(
    getAuthToken: () => Promise<UserAuthTokenResponse>,
  ) {
    this.getAuthToken = getAuthToken;
  }

  selectFrom(table: string): QueryBuilder {
    return new QueryBuilder(this, table);
  }

  private async waitUntilInitialized() {
    while (!this.abortController.signal.aborted) {
      if (this.isInitialized) {
        return;
      }
      await sleep(50);
    }
  }
}

// Todo: Add function to destroy client, unsubscribe all subscriptions, and delete the client registration
//       Call the function to destroy the client in useCloudburstClient

function callbackSubscription(subscription: SubscriptionData) {
  const subscriptionRows = [];
  for (const [_rowId, rowValue] of subscription.rows) {
    subscriptionRows.push(rowValue);
  }
  subscription.callback(subscriptionRows);
}

async function sleep(timeMillis: number) {
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve();
    }, timeMillis);
  });
}

function handleUnexpectedError(tag: string): (error: unknown) => void {
  return (error: unknown) => {
    console.error(
      `Cloudburst encountered an unexpected error ${tag}. This is likely a bug in Cloudburst. ${JSON.stringify(error)}`,
    );
  };
}
