"use client";

import { ReactNode, useEffect, useState } from "react";

import { CloudburstContext } from "./cloudburstContext.js";
import {
  Cloudburst as CloudburstClient,
  UserAuthTokenResponse,
} from "../index.js";

export interface CloudburstProps {
  apiUrl: string;
  getAuthToken: () => Promise<UserAuthTokenResponse>;
  children: ReactNode;
}

export function Cloudburst({
  apiUrl,
  getAuthToken,
  children,
}: CloudburstProps) {
  const [client, _setClient] = useState<CloudburstClient>(() =>
    CloudburstClient.create(apiUrl, getAuthToken),
  );

  useEffect(() => {
    return () => {
      client.dispose();
    };
  }, [client]);

  useEffect(() => {
    client.setAuthTokenRefreshFunction(getAuthToken);
  }, [client, getAuthToken]);

  return (
    <CloudburstContext.Provider value={client}>
      {children}
    </CloudburstContext.Provider>
  );
}
