import { Cloudburst } from "../index.js";
import { useContext } from "react";
import { CloudburstContext } from "./cloudburstContext.js";

export function useCloudburst(): Cloudburst {
  const client = useContext(CloudburstContext);
  if (client === null) {
    throw Error(
      "Called useCloudburst returned null. Code calling useCloudburst must be wrapped in the Cloudburst provider.",
    );
  }
  return client;
}
