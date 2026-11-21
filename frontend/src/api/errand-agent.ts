"use client";

import { z } from "@enterprise/contracts";
import { http } from "./http";

const API_BASE = "/api/public/errand/agent";
const TOKEN_KEY = "errand_agent_token";

export type AgentSession = {
  agent: {
    id: number;
    name: string;
    mobile: string;
    status: string;
    commissionRate: number;
    cityIds: number[];
    balance: number;
    frozen: number;
    totalIncome: number;
  };
  cities: { id: number; name: string }[];
  ordersToday: number;
  gmvToday: number;
  commissionToday: number;
};

async function call<T>(
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  if (token) headers.set("x-agent-token", token);
  const result = await http(`${API_BASE}${path}`, z.unknown(), {
    ...init,
    headers,
    cache: "no-store",
  });
  const body = (result.data || {}) as {
    code?: number;
    message?: string;
    data?: T;
  };
  if (body.code !== undefined && body.code !== 0) {
    throw new Error(body.message || "请求失败");
  }
  return (body.data ?? body) as T;
}

export const agentToken = {
  get: () => (typeof window === "undefined" ? "" : localStorage.getItem(TOKEN_KEY) || ""),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export const errandAgentApi = {
  login: (body: { site: string; mobile: string; password: string }) =>
    call<{ token: string; agent: AgentSession["agent"] }>("/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  me: (token: string) => call<AgentSession>("/me", {}, token),
  orders: (token: string, page = 1, status = "") =>
    call<{ list: Record<string, unknown>[]; total: number }>(
      `/orders?page=${page}&pageSize=20&status=${encodeURIComponent(status)}`,
      {},
      token,
    ),
  wallet: (token: string) =>
    call<{
      balance: number;
      frozen: number;
      totalIncome: number;
      txs: Record<string, unknown>[];
      withdrawals: Record<string, unknown>[];
    }>("/wallet", {}, token),
  withdraw: (token: string, amount: number, bankInfo: string) =>
    call("/withdraw", {
      method: "POST",
      body: JSON.stringify({ amount, bankInfo }),
    }, token),
};