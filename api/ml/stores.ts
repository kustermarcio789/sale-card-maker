import { createClient } from "@supabase/supabase-js";

type StoreRecord = {
  id: string | number;
  description?: string | null;
  network_node_id?: string | null;
  location?: {
    address_line?: string | null;
    street_name?: string | null;
    city?: string | null;
  } | null;
  services?: Record<string, unknown> | null;
};

export default async function handler(_request: any, response: any) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return response.status(500).json({ error: "Supabase env vars are missing" });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: connection, error: connectionError } = await supabase
    .from("ml_connections")
    .select("seller_id, access_token, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (connectionError || !connection?.seller_id || !connection?.access_token) {
    return response.status(200).json({ stores: [] });
  }

  try {
    const storesResponse = await fetch(
      `https://api.mercadolibre.com/users/${connection.seller_id}/stores/search?tags=stock_location`,
      {
        headers: {
          Authorization: `Bearer ${connection.access_token}`,
        },
      }
    );

    if (!storesResponse.ok) {
      return response.status(200).json({ stores: [] });
    }

    const storesPayload = await storesResponse.json();
    const stores = Array.isArray(storesPayload.results)
      ? storesPayload.results.map((store: StoreRecord) => ({
          id: String(store.id),
          description: store.description || null,
          network_node_id: store.network_node_id || null,
          location: store.location || null,
          services: store.services || null,
        }))
      : [];

    return response.status(200).json({ stores });
  } catch {
    return response.status(200).json({ stores: [] });
  }
}
