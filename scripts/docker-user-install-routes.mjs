import { assertText } from "./docker-user-install-shared.mjs";

export const routeCases = [
  {
    agent: "dcc-librarian-flash",
    model: "deepseek-v4-flash",
    name: "librarian",
    prompt: "간단히 현재 폴더 구조를 요약해줘",
  },
  {
    agent: "dcc-worker-flash",
    model: "deepseek-v4-flash",
    name: "worker-flash",
    prompt: "빠르게 오타만 수정해줘",
  },
  {
    agent: "dcc-verifier-pro",
    model: "deepseek-v4-pro",
    name: "verifier",
    prompt: "보안 취약점과 배포 위험을 검증해줘",
  },
  {
    agent: "dcc-planner-pro",
    model: "deepseek-v4-pro",
    name: "planner",
    prompt: "Docker 설치 계획을 세워줘",
  },
  {
    agent: "dcc-worker-pro",
    model: "deepseek-v4-pro",
    name: "worker-pro",
    prompt: "ultrawork로 복잡 구현을 끝까지 진행해줘",
  },
];

export const proxyResponse = ({ input, mode, model, name, port, runStep }) => {
  const response = runStep(`proxy-response-${name}`, "curl", [
    "-sS",
    `http://127.0.0.1:${port}/v1/responses`,
    "-H",
    "content-type: application/json",
    "-d",
    JSON.stringify({ input, model }),
  ]);
  assertText(
    "proxy response",
    response.stdout,
    mode === "live" ? "response" : "docker mock response ok",
  );
};
