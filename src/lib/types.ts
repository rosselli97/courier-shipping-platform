// Hand-written mirrors of backend/models/schemas.py — keep in sync.
export type CourierId = "poste" | "brt" | "dhl" | "fedex" | "ups" | "other";
export type ShipmentStatus = "creata" | "in_transito" | "in_consegna" | "consegnata" | "giacenza";
export type MarkupType = "percent" | "fixed";

export interface UserPublic {
  id: string;
  email: string;
  role: "admin" | "reseller";
  company_name: string;
  wallet_balance: number;
  status: "active" | "suspended";
}

export interface QuoteRequest {
  origin_cap: string;
  dest_cap: string;
  weight_kg: number;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  pieces: number;
  is_pallet: boolean;
  source?: "auto" | "local" | "travelbox";
}

export interface CourierQuote {
  id?: string | null;
  courier: CourierId;
  courier_name: string;
  service_name: string;
  delivery_time: string;
  features: string[];
  base_cost: number;
  fuel_surcharge: number;
  markup: number;
  price: number;
  source?: "local" | "travelbox";
  price_includes_vat?: boolean;
}

export interface QuoteParty {
  name?: string | null;
  street?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  email?: string | null;
  phone?: string | null;
  contact?: string | null;
}

export interface QuoteResponse {
  is_pallet: boolean;
  pallet_zone: string | null;
  billable_weight_kg: number;
  volumetric_weight_kg: number;
  origin_city: string;
  dest_city: string;
  quotes: CourierQuote[];
  provider?: "local" | "travelbox";
  notice?: string | null;
  sender?: QuoteParty | null;
}

export interface TrackingEvent {
  status: ShipmentStatus;
  description: string;
  location: string;
  timestamp: string;
}

export interface TrackingResponse {
  tracking_code: string;
  courier: CourierId;
  courier_name: string;
  origin_city: string;
  dest_city: string;
  status: ShipmentStatus;
  created_at: string;
  events: TrackingEvent[];
}

export interface ResellerShipment {
  id: string;
  tracking_code: string;
  courier: CourierId;
  origin_cap: string;
  origin_city: string;
  dest_cap: string;
  dest_city: string;
  recipient_name: string;
  weight_kg: number;
  price: number;
  status: ShipmentStatus;
  created_at: string;
  email_status: EmailStatus;
  is_pallet: boolean;
}

export type EmailStatus = "none" | "pending" | "sent" | "failed";

export interface ShipmentCreate extends QuoteRequest {
  courier: CourierId;
  recipient_name: string;
  recipient_address: string;
  recipient_email: string | null;
}

export type TopUpPackage = "50" | "100" | "250" | "500";

export interface WalletTx {
  id: string;
  type: "shipment" | "stripe_topup" | "admin_adjust" | "topup";
  amount: number;
  ref: string | null;
  note: string | null;
  created_at: string;
  balance_after: number;
}

export interface CheckoutResponse {
  checkout_url: string;
  session_id: string;
}

export interface PaymentStatus {
  session_id: string;
  status: string;
  payment_status: string;
  amount: number;
  wallet_balance: number;
}

export interface ClientMarkup {
  standard: MarkupRule[];
  overrides: MarkupRule[];
}

export interface MonthStat {
  month: string;
  shipments: number;
  spent: number;
}

export interface ResellerSummary {
  company_name: string;
  wallet_balance: number;
  shipments_this_month: number;
  spent_this_month: number;
  in_transit: number;
  delivered: number;
  monthly: MonthStat[];
}

export interface MarkupRule {
  courier: CourierId;
  type: MarkupType;
  value: number;
}

export interface AdminMonth {
  month: string;
  revenue: number;
  costs: number;
}

export interface CourierSplit {
  courier: CourierId;
  shipments: number;
  revenue: number;
}

export interface AdminKpis {
  total_revenue: number;
  courier_costs: number;
  net_profit: number;
  net_margin_pct: number;
  total_shipments: number;
  active_clients: number;
  monthly: AdminMonth[];
  by_courier: CourierSplit[];
}

export interface ClientRow {
  id: string;
  email: string;
  company_name: string;
  vat_number: string;
  wallet_balance: number;
  status: "active" | "suspended";
  shipments: number;
  revenue: number;
  created_at: string;
  custom_markups: number;
  contact_name: string | null;
  phone: string | null;
  address: string | null;
  self_registered: boolean;
}

export interface SignupRequest {
  company_name: string;
  vat_number: string;
  email: string;
  password: string;
  contact_name: string | null;
  phone: string | null;
  address: string | null;
  accept_terms: true;
}

export interface ClientCreate {
  email: string;
  company_name: string;
  vat_number: string;
  password: string;
  initial_balance: number;
}

export interface Contact {
  id: string;
  name: string;
  address: string;
  cap: string;
  city: string;
  email: string | null;
  uses: number;
  last_used_at: string;
}

export interface PalletRate {
  courier: CourierId;
  zone: 1 | 2 | 3;
  price: number;
}

export interface PalletRatesResponse {
  zones: Record<string, string>;
  rates: PalletRate[];
}

export interface ContactInput {
  name: string;
  address: string;
  cap: string;
  email: string | null;
}

export type TicketCategory = "ritardo" | "danno" | "smarrito" | "fatturazione" | "account" | "altro";
export type TicketStatus = "open" | "answered" | "closed";

export interface TicketMessage {
  id: string;
  author_role: "admin" | "reseller";
  author_name: string;
  body: string;
  created_at: string;
}

export interface TicketSummary {
  id: string;
  number: number;
  client_id: string;
  client_name: string;
  subject: string;
  category: TicketCategory;
  tracking_code: string | null;
  status: TicketStatus;
  unread: boolean;
  messages_count: number;
  last_message_preview: string;
  created_at: string;
  updated_at: string;
}

export interface TicketDetail extends TicketSummary {
  messages: TicketMessage[];
}

export interface TicketCreate {
  subject: string;
  category: TicketCategory;
  tracking_code: string | null;
  message: string;
}
