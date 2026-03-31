import { supabase } from "@/integrations/supabase/client";
import {
  createMLOAuthSession,
  resolveMLRedirectUri,
} from "@/services/mlOAuth";

export interface MLConnection {
  id: string;
  seller_id: string;
  seller_nickname: string | null;
  last_sync_at: string | null;
  token_expires_at: string;
  created_at: string;
}

export interface MLOrder {
  id: string;
  order_id: string;
  sale_number: string;
  sale_date: string;
  buyer_name: string | null;
  buyer_nickname: string | null;
  item_title: string | null;
  item_id: string | null;
  sku: string | null;
  quantity: number;
  amount: number | null;
  order_status: string | null;
}

async function getFunctionsErrorMessage(
  error: unknown,
  fallbackMessage: string
): Promise<string> {
  if (error && typeof error === "object" && "context" in error) {
    const context = (error as { context?: Response }).context;
    if (context && typeof context.text === "function") {
      try {
        const bodyText = await context.text();
        if (bodyText) {
          try {
            const body = JSON.parse(bodyText) as {
              error?: string;
              details?: string;
              message?: string;
            };
            return body.details || body.error || body.message || fallbackMessage;
          } catch {
            return bodyText;
          }
        }
      } catch {
        // Ignore parsing errors and use fallback below.
      }
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
}

export async function getMLConnectionStatus(): Promise<MLConnection | null> {
  const { data } = await supabase.functions.invoke("ml-auth", {
    body: { action: "status" },
  });
  return data?.connection ?? null;
}

export async function startMLOAuth(): Promise<string> {
  const { redirectUri, state, codeChallenge } = await createMLOAuthSession();
  const { data, error } = await supabase.functions.invoke("ml-auth", {
    body: {
      action: "get_auth_url",
      redirect_uri: redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    },
  });

  if (error || !data?.url) {
    throw new Error(
      await getFunctionsErrorMessage(error, "Não foi possível iniciar a conexão com o Mercado Livre.")
    );
  }

  return data.url;
}

export async function exchangeMLCode(params: {
  code: string;
  redirectUri?: string;
  codeVerifier?: string;
}): Promise<MLConnection> {
  const redirectUri = params.redirectUri || resolveMLRedirectUri();
  const { data, error } = await supabase.functions.invoke("ml-auth", {
    body: {
      action: "exchange_code",
      code: params.code,
      redirect_uri: redirectUri,
      code_verifier: params.codeVerifier,
    },
  });

  if (error || !data?.success) {
    throw new Error(
      data?.details ||
        data?.error ||
        (await getFunctionsErrorMessage(error, "Não foi possível concluir a conexão com o Mercado Livre."))
    );
  }
  return data.connection;
}

export async function syncMLOrders(
  connectionId: string,
  filters?: { date_from?: string; date_to?: string; status_filter?: string }
): Promise<{ total_fetched: number; synced: number }> {
  const { data, error } = await supabase.functions.invoke("ml-sync-orders", {
    body: { connection_id: connectionId, ...filters },
  });

  if (error || !data?.success) {
    throw new Error(data?.error || "Failed to sync orders");
  }
  return { total_fetched: data.total_fetched, synced: data.synced };
}

export async function disconnectML(connectionId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("ml-disconnect", {
    body: { connection_id: connectionId },
  });

  if (error || !data?.success) {
    throw new Error("Failed to disconnect");
  }
}

export async function getMLOrders(): Promise<MLOrder[]> {
  const { data, error } = await supabase
    .from("ml_orders")
    .select("id, order_id, sale_number, sale_date, buyer_name, buyer_nickname, item_title, item_id, sku, quantity, amount, order_status")
    .order("sale_date", { ascending: false })
    .limit(100);

  if (error) throw error;
  return (data as MLOrder[]) ?? [];
}
