const SUPABASE_URL = "https://gyaddryvtuzllcggorjc.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_USdCDZTlvuXFTOBlAvYSpQ_ne5ka8Ee";

type ConnectionRow = {
  seller_id: string;
  access_token: string;
};

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
  try {
    const connectionResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/ml_connections?select=seller_id,access_token&order=created_at.desc&limit=1`,
      {
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        },
      }
    );

    if (!connectionResponse.ok) {
      return response.status(200).json({ stores: [] });
    }

    const connections = (await connectionResponse.json()) as ConnectionRow[];
    const connection = connections[0];

    if (!connection?.seller_id || !connection?.access_token) {
      return response.status(200).json({ stores: [] });
    }

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
  } catch (error) {
    return response.status(200).json({
      stores: [],
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
