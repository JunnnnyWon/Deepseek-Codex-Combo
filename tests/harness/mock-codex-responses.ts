export interface MockResponsesRequest {
  readonly input: string;
  readonly model: string;
}

export interface MockResponsesResult {
  readonly id: string;
  readonly outputText: string;
  readonly status: "completed";
}

export interface MockResponsesClient {
  readonly calls: () => readonly MockResponsesRequest[];
  readonly create: (request: MockResponsesRequest) => Promise<MockResponsesResult>;
}

const defaultResult: MockResponsesResult = {
  id: "resp_fixture",
  outputText: "fixture response",
  status: "completed",
};

export const createMockResponsesClient = (
  result: MockResponsesResult = defaultResult,
): MockResponsesClient => {
  const calls: MockResponsesRequest[] = [];

  return {
    calls: () => [...calls],
    create: async (request) => {
      calls.push(request);
      return result;
    },
  };
};
