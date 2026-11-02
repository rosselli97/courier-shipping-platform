import { API_BASE, ApiError, apiGet, apiPost } from "./api";

export interface TravelBoxParty {
  name?: string | null;
  street?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
  email?: string | null;
  phone?: string | null;
  kind?: string | null;
}

export interface TravelBoxAddress {
  id: string | null;
  party: TravelBoxParty;
  kind: string | null;
  source?: string;
}

export interface TravelBoxPackage {
  pieces?: number | null;
  weight_kg?: number | null;
  width_cm?: number | null;
  height_cm?: number | null;
  length_cm?: number | null;
  type?: string | null;
}

export interface TravelBoxMoney {
  amount?: string | number | null;
  currency?: string;
  formatted?: string | null;
}

export interface TravelBoxOffer {
  id?: string | null;
  carrier?: string | null;
  service?: string | null;
  price?: TravelBoxMoney | null;
  net_price?: TravelBoxMoney | null;
  tax?: TravelBoxMoney | null;
  currency?: string;
  weight_kg?: number | null;
  list_id?: string | null;
  detail_id?: string | null;
  delivery_days?: string | null;
  book_url?: string | null;
  raw_text?: string | null;
}

export interface TravelBoxDraft {
  sender_id: string;
  recipient_id: string;
  sender_city: string;
  sender_cap: string;
  sender_province: string;
  sender_country?: string;
  sender_country_code?: string;
  recipient_city: string;
  recipient_cap: string;
  recipient_province: string;
  recipient_country?: string;
  recipient_country_code?: string;
  packages: TravelBoxPackage[];
  service_type?: "nazionale" | "importexport";
  notes?: string | null;
}

export interface TravelBoxQuoteResult {
  offers: TravelBoxOffer[];
  message?: string | null;
  draft: TravelBoxDraft;
  fetched_at: string;
}

export interface TravelBoxShipment {
  id?: string | null;
  reference?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  status?: string | null;
  carrier?: string | null;
  service?: string | null;
  sender?: TravelBoxParty | null;
  recipient?: TravelBoxParty | null;
  weight_kg?: number | null;
  chargeable_weight_kg?: number | null;
  pieces?: number | null;
  price?: TravelBoxMoney | null;
  created_at?: string | null;
  payment_method?: string | null;
  detail_url?: string | null;
  label_url?: string | null;
  label_token?: string | null;
  pickup_date?: string | null;
  source?: string;
}

export interface TravelBoxCreateResult {
  status: "preview" | "submitted";
  message: string;
  offer?: TravelBoxOffer | null;
  shipment?: TravelBoxShipment | null;
}

export interface TravelBoxHealth {
  ok: boolean;
  logged_in: boolean;
  base_url: string;
  checked_at: string;
  detail?: string | null;
}

export interface TravelBoxLabelGroup {
  id: string;
  name: string;
}

export interface TravelBoxCheckoutPayload {
  origin_cap: string;
  dest_cap: string;
  origin_city?: string | null;
  dest_city?: string | null;
  weight_kg: number;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  pieces: number;
  is_pallet: boolean;
  offer_id: string;
  recipient_name: string;
  recipient_address: string;
  recipient_email?: string | null;
  recipient_phone?: string | null;
  recipient_contact?: string | null;
  sender_name?: string | null;
  sender_address?: string | null;
  sender_email?: string | null;
  sender_phone?: string | null;
  sender_contact?: string | null;
  description?: string | null;
  pickup_date?: string | null;
  pickup_slot?: "9-12" | "12-15" | "15-18" | "18-21" | null;
  pickup_at_sender?: boolean;
  confirm?: boolean;
}

export interface TravelBoxCheckoutResult {
  status: "preview" | "submitted";
  message: string;
  reference?: string | null;
  tracking_number?: string | null;
  shipment_id?: string | null;
  label_token?: string | null;
}

const TB = "/travelbox";

export const tbHealth = () => apiGet<TravelBoxHealth>(`${TB}/health`);
export const tbAddressBook = () => apiGet<TravelBoxAddress[]>(`${TB}/address-book`);
export const tbLabelGroups = () => apiGet<TravelBoxLabelGroup[]>(`${TB}/label-groups`);
export const tbQuote = (draft: TravelBoxDraft) => apiPost<TravelBoxQuoteResult>(`${TB}/shipments/quote`, draft);
export const tbCreateShipment = (payload: { draft: TravelBoxDraft; offer_id?: string; confirm: boolean }) =>
  apiPost<TravelBoxCreateResult>(`${TB}/shipments`, payload);

export const tbCheckout = (payload: TravelBoxCheckoutPayload) =>
  apiPost<TravelBoxCheckoutResult>(`${TB}/checkout`, payload);

export function tbCheckoutLabelHref(result: TravelBoxCheckoutResult): string | null {
  if (result.shipment_id) return `${API_BASE}/travelbox/shipments/${encodeURIComponent(result.shipment_id)}/label`;
  if (result.label_token) return tbLabelTokenHref(result.label_token);
  return null;
}

export const tbShipments = (params: { page: number; dateFrom: string; dateTo: string; refresh?: boolean }) => {
  const q = new URLSearchParams({
    page: String(params.page),
    date_from: params.dateFrom,
    date_to: params.dateTo,
    refresh: params.refresh ? "true" : "false",
  });
  return apiGet<TravelBoxShipment[]>(`${TB}/shipments?${q.toString()}`);
};

export const tbCart = (refresh = false) => apiGet<TravelBoxShipment[]>(`${TB}/cart?refresh=${refresh ? "true" : "false"}`);

export function tbMoney(money?: TravelBoxMoney | null): string {
  if (!money) return "—";
  if (money.formatted) return money.formatted;
  const raw = typeof money.amount === "string" ? Number(money.amount) : money.amount;
  if (typeof raw !== "number" || Number.isNaN(raw)) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: money.currency || "EUR" }).format(raw);
}

export function tbLabelHref(shipment: TravelBoxShipment): string | null {
  if (shipment.id) return `${API_BASE}/travelbox/shipments/${encodeURIComponent(shipment.id)}/label`;
  if (shipment.label_token) return `${API_BASE}/travelbox/labels/${shipment.label_token}`;
  return null;
}

export function tbLabelTokenHref(token: string): string {
  return `${API_BASE}/travelbox/labels/${token}`;
}

export async function tbMergeLabels(shipmentIds: (string | number)[], groupId: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/travelbox/labels/merge`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shipment_ids: shipmentIds, group_id: groupId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body);
  }
  return await res.blob();
}
