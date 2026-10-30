import { useMemo, useState, type FormEvent, type ReactNode } from "react"

type Screen = "home" | "couriers" | "business" | "admin"
type IconName = "arrow-left" | "arrow-right" | "bell" | "box" | "briefcase" | "check" | "chevron-down" | "clock" | "download" | "file" | "grid" | "headset" | "home" | "location" | "menu" | "package" | "plus" | "search" | "settings" | "shield" | "sliders" | "trend" | "truck" | "users" | "wallet"

function Icon({ name, size = 20 }: { name: IconName size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    "arrow-left": <path d="m15 18-6-6 6-6" />,
    "arrow-right": (
      <>
        <path d="m9 18 6-6-6-6" />
        <path d="M4 12h11" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    box: (
      <>
        <path d="m21 8-9 5-9-5" />
        <path d="m3 8 9-5 9 5v8l-9 5-9-5Z" />
        <path d="M12 13v8" />
      </>
    ),
    briefcase: (
      <>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    "chevron-down": <path d="m7 10 5 5 5-5" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
        <path d="M5 21h14" />
      </>
    ),
    file: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16h16V8Z" />
        <path d="M14 2v6h6M8 13h8M8 17h5" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    headset: (
      <>
        <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
        <path d="M4 15a2 2 0 0 0 2 2h2v-6H6a2 2 0 0 0-2 2v2Zm16 0a2 2 0 0 1-2 2h-2v-6h2a2 2 0 0 1 2 2v2ZM16 19c-1 2-3 2-5 2" />
      </>
    ),
    home: (
      <>
        <path d="m3 11 9-8 9 8" />
        <path d="M5 10v10h14V10M9 20v-6h6v6" />
      </>
    ),
    location: (
      <>
        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    menu: (
      <>
        <path d="M4 7h16M4 12h16M4 17h16" />
      </>
    ),
    package: (
      <>
        <path d="m21 8-9 5-9-5" />
        <path d="m3 8 9-5 9 5v8l-9 5-9-5Z" />
        <path d="M12 13v8M7.5 5.5l9 5" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    shield: (
      <>
        <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    sliders: (
      <>
        <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h7M15 18h5" />
        <circle cx="16" cy="6" r="2" />
        <circle cx="8" cy="12" r="2" />
        <circle cx="13" cy="18" r="2" />
      </>
    ),
    trend: (
      <>
        <path d="m3 17 6-6 4 4 8-9" />
        <path d="M15 6h6v6" />
      </>
    ),
    truck: (
      <>
        <path d="M3 5h11v12H3Z" />
        <path d="M14 9h4l3 4v4h-7Z" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="18" cy="18" r="2" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
      </>
    ),
    wallet: (
      <>
        <path d="M3 6a2 2 0 0 1 2-2h13v16H5a2 2 0 0 1-2-2Z" />
        <path d="M3 7h15a3 3 0 0 1 3 3v6h-6a3 3 0 0 1 0-6h6" />
      </>
    ),
  }
  return (
    <svg
      aria-hidden="true"
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  )
}

function Logo({ light = false }: { light?: boolean }) {
  return (
    <img
      className={light ? "brand-logo brand-logo-light" : "brand-logo"}
      src="/brand/muvpack-logo.svg"
      alt="Muvpack"
    />
  )
}

function Button({
  children,
  variant = "primary",
  icon,
  onClick,
  type = "button",
  className = "",
}: {
  children: ReactNode
  variant?: "primary" | "secondary" | "ghost"
  icon?: IconName
  onClick?: () => void
  type?: "button" | "submit"
  className?: string
}) {
  return (
    <button
      className={`button button-${variant} ${className}`}
      onClick={onClick}
      type={type}
    >
      {children}
      {icon && <Icon name={icon} size={18} />}
    </button>
  )
}

function Field({
  label,
  placeholder,
  value,
  onChange,
  suffix,
  icon,
}: {
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  suffix?: string
  icon?: IconName
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-control">
        {icon && (
          <span className="field-icon">
            <Icon name={icon} size={18} />
          </span>
        )}
        <input
          className={icon ? "has-icon" : ""}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
        {suffix && <span className="field-suffix">{suffix}</span>}
      </span>
    </label>
  )
}

function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div className="phone-stage">
      <div className="phone">
        <div className="phone-status">
          <span>9:41</span>
          <span className="status-icons">● ◒</span>
        </div>
        {children}
      </div>
      <div className="phone-caption">Anteprima mobile interattiva</div>
    </div>
  )
}

function MobileHeader() {
  return (
    <div className="mobile-header">
      <Logo />
      <button className="icon-button" aria-label="Apri menu">
        <Icon name="menu" />
      </button>
    </div>
  )
}

function MobileNav({
  active,
  setScreen,
}: {
  active: Screen
  setScreen: (screen: Screen) => void
}) {
  return (
    <div className="mobile-nav">
      <button
        className={active === "home" ? "active" : ""}
        onClick={() => setScreen("home")}
      >
        <Icon name="home" size={19} />
        <span>Inizio</span>
      </button>
      <button
        className={active === "couriers" ? "active" : ""}
        onClick={() => setScreen("couriers")}
      >
        <Icon name="package" size={19} />
        <span>Spedisci</span>
      </button>
      <button>
        <Icon name="search" size={19} />
        <span>Traccia</span>
      </button>
      <button>
        <Icon name="headset" size={19} />
        <span>Assistenza</span>
      </button>
    </div>
  )
}

function HomeScreen({ setScreen }: { setScreen: (screen: Screen) => void }) {
  const [origin, setOrigin] = useState("")
  const [destination, setDestination] = useState("")
  const [weight, setWeight] = useState("")
  const [length, setLunghezza] = useState("")
  const [width, setLarghezza] = useState("")
  const [height, setAltezza] = useState("")
  const [tracking, setTracking] = useState("")
  const [trackingResult, setTrackingResult] = useState("")

  function submitQuote(event: FormEvent) {
    event.preventDefault()
    setScreen("couriers")
  }

  function submitTracking(event: FormEvent) {
    event.preventDefault()
    setTrackingResult(
      tracking
        ? "La spedizione è in transito verso il centro di Milano"
        : "Inserisci un numero di tracking",
    )
  }

  return (
    <PhoneShell>
      <MobileHeader />
      <main className="mobile-content home-content">
        <div className="mobile-hero">
          <span className="eyebrow">SPEDISCI MEGLIO</span>
          <h1>
            Spedisci tutto,
            <br />
            <em>ovunque.</em>
          </h1>
          <p>Confronta i corrieri e prenota in pochi minuti.</p>
        </div>
        <form className="calculator-card" onSubmit={submitQuote}>
          <div className="section-heading">
            <div className="heading-icon">
              <Icon name="box" />
            </div>
            <div>
              <h2>Ottieni un preventivo immediato</h2>
              <p>Inserisci i dati della spedizione</p>
            </div>
          </div>
          <div className="field-grid">
            <Field
              label="CAP di partenza"
              placeholder="e.g. 20121"
              value={origin}
              onChange={setOrigin}
              icon="location"
            />
            <Field
              label="CAP di destinazione"
              placeholder="e.g. 00118"
              value={destination}
              onChange={setDestination}
              icon="location"
            />
          </div>
          <Field
            label="Peso del pacco"
            placeholder="0,0"
            value={weight}
            onChange={setWeight}
            suffix="kg"
          />
          <div className="dimensions-label">
            <span>Dimensioni</span>
            <span>L × P × A</span>
          </div>
          <div className="dimension-grid">
            <Field
              label=""
              placeholder="Lunghezza"
              value={length}
              onChange={setLunghezza}
              suffix="cm"
            />
            <Field
              label=""
              placeholder="Larghezza"
              value={width}
              onChange={setLarghezza}
              suffix="cm"
            />
            <Field
              label=""
              placeholder="Altezza"
              value={height}
              onChange={setAltezza}
              suffix="cm"
            />
          </div>
          <Button type="submit" icon="arrow-right" className="wide-button">
            Vedi le opzioni di spedizione
          </Button>
        </form>
        <form className="tracking-card" onSubmit={submitTracking}>
          <div>
            <h3>Hai già spedito?</h3>
            <p>Segui il pacco in tempo reale.</p>
          </div>
          <div className="track-input">
            <Icon name="search" size={18} />
            <input
              value={tracking}
              onChange={(event) => setTracking(event.target.value)}
              placeholder="Enter tracking number"
            />
            <button aria-label="Traccia spedizione" type="submit">
              <Icon name="arrow-right" size={18} />
            </button>
          </div>
          {trackingResult && (
            <div className="inline-result">
              <Icon name="truck" size={16} />
              {trackingResult}
            </div>
          )}
        </form>
        <div className="trust-row">
          <span>
            <Icon name="shield" size={16} /> Pagamento sicuro
          </span>
          <span>Valutazione clienti 4,9/5</span>
        </div>
      </main>
      <MobileNav active="home" setScreen={setScreen} />
    </PhoneShell>
  )
}

const couriers = [
  {
    id: "poste",
    name: "Poste Italiane",
    initials: "PI",
    meta: "Poste Delivery Express",
    time: "2–3 giorni lavorativi",
    price: "€8,90",
    color: "yellow",
    badge: "MIGLIOR PREZZO",
  },
  {
    id: "brt",
    name: "BRT",
    initials: "BRT",
    meta: "Servizio Express",
    time: "1–2 giorni lavorativi",
    price: "€11,40",
    color: "red",
    badge: "PIÙ VELOCE",
  },
  {
    id: "dhl",
    name: "DHL Express",
    initials: "DHL",
    meta: "Express internazionale",
    time: "Prossimo giorno lavorativo",
    price: "€16,80",
    color: "dhl",
    badge: "",
  },
]

function CorrieriScreen({
  setScreen,
}: {
  setScreen: (screen: Screen) => void
}) {
  const [selected, setSelezionato] = useState("poste")
  const [confirmed, setConfirmed] = useState(false)
  return (
    <PhoneShell>
      <div className="mobile-header courier-header">
        <button
          className="icon-button"
          aria-label="Indietro"
          onClick={() => setScreen("home")}
        >
          <Icon name="arrow-left" />
        </button>
        <span>Scegli un corriere</span>
        <button className="icon-button" aria-label="Assistenza">
          <Icon name="headset" />
        </button>
      </div>
      <main className="mobile-content couriers-content">
        <div className="route-card">
          <div>
            <span className="route-dot"></span>
            <p>Da</p>
            <strong>20121 Milano</strong>
          </div>
          <div className="route-line">
            <Icon name="truck" size={20} />
          </div>
          <div>
            <span className="route-dot destination"></span>
            <p>A</p>
            <strong>00118 Roma</strong>
          </div>
          <button aria-label="Modifica spedizione">
            <Icon name="settings" size={17} />
          </button>
          <div className="package-summary">
            <span>
              <Icon name="package" size={16} /> 2,5 kg
            </span>
            <span>30 × 20 × 15 cm</span>
          </div>
        </div>
        <div className="results-title">
          <div>
            <span className="eyebrow">3 OPZIONI TROVATE</span>
            <h1>Scegli la soluzione più adatta</h1>
          </div>
          <button aria-label="Filtra">
            <Icon name="sliders" />
          </button>
        </div>
        <div className="courier-list">
          {couriers.map((courier) => (
            <button
              className={`courier-card ${
                selected === courier.id ? "selected" : ""
              }`}
              key={courier.id}
              onClick={() => {
                setSelezionato(courier.id)
                setConfirmed(false)
              }}
            >
              {courier.badge && (
                <span className={`courier-badge badge-${courier.color}`}>
                  {courier.badge}
                </span>
              )}
              <span className={`courier-logo logo-${courier.color}`}>
                {courier.initials}
              </span>
              <span className="courier-info">
                <strong>{courier.name}</strong>
                <small>{courier.meta}</small>
                <span>
                  <Icon name="clock" size={15} /> {courier.time}
                </span>
                <span>
                  <Icon name="shield" size={15} /> Tracciata e assicurata
                </span>
              </span>
              <span className="courier-price">
                <small>da</small>
                <strong>{courier.price}</strong>
                <span className="radio">
                  <i></i>
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="selection-footer">
          <div>
            <span>Prezzo totale</span>
            <strong>
              {couriers.find((courier) => courier.id === selected)?.price}
            </strong>
          </div>
          <Button
            icon={confirmed ? "check" : "arrow-right"}
            onClick={() => setConfirmed(true)}
          >
            {confirmed ? "Selezionato" : "Continua"}
          </Button>
        </div>
        <div className="safe-note">
          <Icon name="shield" size={16} /> Tutti i prezzi includono IVA e
          assicurazione base .
        </div>
      </main>
      <MobileNav active="couriers" setScreen={setScreen} />
    </PhoneShell>
  )
}

function Sidebar({ active }: { active: "business" | "admin" }) {
  const admin = active === "admin"
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <Logo light />
      </div>
      <div className="workspace-switcher">
        <span className="avatar">{admin ? "MA" : "NC"}</span>
        <div>
          <strong>{admin ? "Muvpack Admin" : "Nord Commerce"}</strong>
          <small>
            {admin ? "Super amministratore" : "Rivenditore business"}
          </small>
        </div>
        <Icon name="chevron-down" size={16} />
      </div>
      <nav>
        <span className="nav-label">AREA DI LAVORO</span>
        <button className="active">
          <Icon name="grid" /> Panoramica
        </button>
        <button>
          <Icon name="package" /> Spedizioni{" "}
          <span className="nav-count">12</span>
        </button>
        {!admin && (
          <button>
            <Icon name="wallet" /> Portafoglio
          </button>
        )}
        {admin && (
          <button>
            <Icon name="briefcase" /> Corrieri
          </button>
        )}
        {admin && (
          <button>
            <Icon name="users" /> Clienti B2B
          </button>
        )}
        {admin && (
          <button>
            <Icon name="sliders" /> Regole di ricarico
          </button>
        )}
        <span className="nav-label">GESTIONE</span>
        <button>
          <Icon name="file" /> {admin ? "Fatture" : "Pagamenti"}
        </button>
        <button>
          <Icon name="settings" /> Impostazioni
        </button>
      </nav>
      <div className="sidebar-help">
        <span>
          <Icon name="headset" />
        </span>
        <strong>Serve aiuto?</strong>
        <small>Il nostro team è a tua disposizione.</small>
        <button>Contatta l’assistenza</button>
      </div>
      <div className="user-row">
        <span className="avatar small">MC</span>
        <div>
          <strong>Marco Conti</strong>
          <small>marco@muvpack.it</small>
        </div>
        <Icon name="chevron-down" size={15} />
      </div>
    </aside>
  )
}

function DashboardHeader({
  title,
  subtitle,
  action,
  onAction,
}: {
  title: string
  subtitle: string
  action: string
  onAction?: () => void
}) {
  return (
    <header className="dashboard-header">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="header-actions">
        <button className="icon-button bordered" aria-label="Notifiche">
          <Icon name="bell" size={19} />
          <i></i>
        </button>
        <Button icon="plus" onClick={onAction}>
          {action}
        </Button>
      </div>
    </header>
  )
}

const shipments = [
  {
    id: "MVP-29841",
    customer: "Olivia Rossi",
    route: "Milano → Roma",
    courier: "BRT",
    date: "12 giu 2025",
    status: "In transito",
    tone: "orange",
  },
  {
    id: "MVP-29840",
    customer: "Andrea Bianchi",
    route: "Torino → Firenze",
    courier: "DHL",
    date: "12 giu 2025",
    status: "Consegnata",
    tone: "green",
  },
  {
    id: "MVP-29839",
    customer: "Sofia Romano",
    route: "Bologna → Napoli",
    courier: "Poste",
    date: "11 giu 2025",
    status: "Etichetta pronta",
    tone: "blue",
  },
  {
    id: "MVP-29838",
    customer: "Luca Ferrari",
    route: "Genova → Bari",
    courier: "BRT",
    date: "11 giu 2025",
    status: "Anomalia",
    tone: "red",
  },
  {
    id: "MVP-29837",
    customer: "Giulia Esposito",
    route: "Verona → Padova",
    courier: "DHL",
    date: "10 giu 2025",
    status: "Consegnata",
    tone: "green",
  },
]

function downloadLabel(id: string) {
  const blob = new Blob(
    [
      `ETICHETTA DI SPEDIZIONE MUVPACK\nSpedizione: ${id}\nGenerata dalla dashboard rivenditore.`,
    ],
    { type: "text/plain" },
  )
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `${id}-label.txt`
  anchor.click()
  URL.revokeObjectURL(url)
}

function BusinessDashboard() {
  const [query, setQuery] = useState("")
  const filtered = useMemo(
    () =>
      shipments.filter((shipment) =>
        `${shipment.id} ${shipment.customer} ${shipment.route}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [query],
  )
  return (
    <div className="dashboard-shell">
      <Sidebar active="business" />
      <main className="dashboard-main">
        <DashboardHeader
          title="Buongiorno, Marco"
          subtitle="Ecco l’andamento delle tue spedizioni di oggi."
          action="Crea spedizione"
        />
        <section className="metric-grid business-metrics">
          <article className="metric-card accent-card">
            <div className="metric-top">
              <span className="metric-icon light">
                <Icon name="wallet" />
              </span>
              <span className="metric-menu">•••</span>
            </div>
            <p>Saldo portafoglio</p>
            <h2>€2.480,60</h2>
            <button>
              <Icon name="plus" size={16} /> Aggiungi fondi
            </button>
          </article>
          <article className="metric-card">
            <div className="metric-top">
              <span className="metric-icon orange">
                <Icon name="package" />
              </span>
              <span className="delta positive">+12,5%</span>
            </div>
            <p>Spedizioni mensili</p>
            <h2>284</h2>
            <small>rispetto a 252 il mese scorso</small>
          </article>
          <article className="metric-card">
            <div className="metric-top">
              <span className="metric-icon blue">
                <Icon name="trend" />
              </span>
              <span className="delta positive">+8,2%</span>
            </div>
            <p>Spesa mensile</p>
            <h2>€3.842</h2>
            <small>rispetto a €3.551 il mese scorso</small>
          </article>
          <article className="metric-card">
            <div className="metric-top">
              <span className="metric-icon green">
                <Icon name="check" />
              </span>
              <span className="delta">96,8%</span>
            </div>
            <p>Consegne puntuali</p>
            <h2>97,2%</h2>
            <small>276 consegnate puntualmente</small>
          </article>
        </section>
        <section className="dashboard-columns">
          <div className="chart-card card">
            <div className="card-heading">
              <div>
                <h2>Attività spedizioni</h2>
                <p>Spedizioni negli ultimi 7 giorni</p>
              </div>
              <button className="select-button">
                Ultimi 7 giorni <Icon name="chevron-down" size={15} />
              </button>
            </div>
            <div className="bar-chart">
              {[52, 66, 44, 78, 62, 88, 58].map((height, index) => (
                <div key={index}>
                  <span
                    style={{ height: `${height}%` }}
                    className={index === 5 ? "highlight" : ""}
                  ></span>
                  <small>
                    {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"][index]}
                  </small>
                </div>
              ))}
            </div>
          </div>
          <div className="quick-card card">
            <div className="card-heading">
              <div>
                <h2>Azioni rapide</h2>
                <p>Tutto a portata di mano</p>
              </div>
            </div>
            <button>
              <span className="metric-icon orange">
                <Icon name="plus" />
              </span>
              <div>
                <strong>Nuova spedizione</strong>
                <small>Crea e confronta le tariffe</small>
              </div>
              <Icon name="arrow-right" size={17} />
            </button>
            <button>
              <span className="metric-icon blue">
                <Icon name="wallet" />
              </span>
              <div>
                <strong>Ricarica il portafoglio</strong>
                <small>Aggiungi fondi in sicurezza</small>
              </div>
              <Icon name="arrow-right" size={17} />
            </button>
            <button>
              <span className="metric-icon green">
                <Icon name="search" />
              </span>
              <div>
                <strong>Traccia una spedizione</strong>
                <small>Ricevi aggiornamenti in tempo reale</small>
              </div>
              <Icon name="arrow-right" size={17} />
            </button>
          </div>
        </section>
        <section className="table-card card">
          <div className="card-heading table-heading">
            <div>
              <h2>Spedizioni recenti</h2>
              <p>Le tue ultime attività di spedizione</p>
            </div>
            <div className="table-tools">
              <label>
                <Icon name="search" size={17} />
                <input
                  placeholder="Cerca spedizioni"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <Button variant="secondary">Vedi tutte</Button>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>SPEDIZIONE</th>
                  <th>CLIENTE</th>
                  <th>TRATTA</th>
                  <th>CORRIERE</th>
                  <th>DATA</th>
                  <th>STATO</th>
                  <th>ETICHETTA</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((shipment) => (
                  <tr key={shipment.id}>
                    <td>
                      <strong>{shipment.id}</strong>
                    </td>
                    <td>{shipment.customer}</td>
                    <td>{shipment.route}</td>
                    <td>
                      <span
                        className={`mini-courier ${shipment.courier.toLowerCase()}`}
                      >
                        {shipment.courier}
                      </span>
                    </td>
                    <td>{shipment.date}</td>
                    <td>
                      <span className={`status status-${shipment.tone}`}>
                        {shipment.status}
                      </span>
                    </td>
                    <td>
                      <button
                        className="download-button"
                        onClick={() => downloadLabel(shipment.id)}
                      >
                        <Icon name="download" size={16} /> PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  )
}

const clients = [
  {
    name: "Nord Commerce S.r.l.",
    initials: "NC",
    contact: "Marco Conti",
    plan: "Enterprise",
    shipments: "1.284",
    revenue: "€18.640",
    status: "Attivo",
  },
  {
    name: "Atelier Milano",
    initials: "AM",
    contact: "Elena Riva",
    plan: "Crescita",
    shipments: "846",
    revenue: "€11.820",
    status: "Attivo",
  },
  {
    name: "Casa Verde S.p.A.",
    initials: "CV",
    contact: "Paolo Serra",
    plan: "Crescita",
    shipments: "592",
    revenue: "€8.120",
    status: "In revisione",
  },
  {
    name: "Urban Foods",
    initials: "UF",
    contact: "Anna Fontana",
    plan: "Base",
    shipments: "314",
    revenue: "€4.280",
    status: "Attivo",
  },
]

function AdminDashboard() {
  const [markup, setMarkup] = useState({ poste: "12", brt: "15", dhl: "18" })
  const [saved, setSaved] = useState(false)
  const [showForm, setShowForm] = useState(false)
  return (
    <div className="dashboard-shell">
      <Sidebar active="admin" />
      <main className="dashboard-main">
        <DashboardHeader
          title="Panoramica piattaforma"
          subtitle="Monitora performance, margini e attività dei clienti B2B."
          action="Aggiungi cliente B2B"
          onAction={() => setShowForm(!showForm)}
        />
        {showForm && (
          <div className="notice-bar">
            <Icon name="users" size={18} />
            <strong>Nuovo spazio cliente pronto.</strong>
            <span>
              L’invito di attivazione verrà inviato dopo aver completato i dati
              dell’account.
            </span>
            <button onClick={() => setShowForm(false)}>Chiudi</button>
          </div>
        )}
        <section className="metric-grid admin-metrics">
          <article className="metric-card">
            <div className="metric-top">
              <span className="metric-icon orange">
                <Icon name="wallet" />
              </span>
              <span className="delta positive">+18,4%</span>
            </div>
            <p>Ricavi totali</p>
            <h2>€128.420</h2>
            <small>€19.940 questo mese</small>
          </article>
          <article className="metric-card">
            <div className="metric-top">
              <span className="metric-icon blue">
                <Icon name="truck" />
              </span>
              <span className="delta neutral">+11,2%</span>
            </div>
            <p>Costi corrieri</p>
            <h2>€86.730</h2>
            <small>67,5% dei ricavi lordi</small>
          </article>
          <article className="metric-card dark-metric">
            <div className="metric-top">
              <span className="metric-icon light">
                <Icon name="trend" />
              </span>
              <span className="delta dark">+2,8%</span>
            </div>
            <p>Margine netto</p>
            <h2>32,5%</h2>
            <small>€41.690 di utile netto</small>
          </article>
          <article className="metric-card">
            <div className="metric-top">
              <span className="metric-icon green">
                <Icon name="users" />
              </span>
              <span className="delta positive">+4 questo mese</span>
            </div>
            <p>Clienti B2B attivi</p>
            <h2>42</h2>
            <small>38 attivi · 4 in revisione</small>
          </article>
        </section>
        <section className="admin-columns">
          <div className="card revenue-card">
            <div className="card-heading">
              <div>
                <h2>Ricavi e costi</h2>
                <p>Andamento finanziario degli ultimi 6 mesi</p>
              </div>
              <button className="select-button">
                Ultimi 6 mesi <Icon name="chevron-down" size={15} />
              </button>
            </div>
            <div className="legend">
              <span>
                <i className="revenue"></i>Ricavi
              </span>
              <span>
                <i className="costs"></i>Costi corrieri
              </span>
            </div>
            <div className="line-chart">
              <div className="chart-y">
                <span>€30k</span>
                <span>€20k</span>
                <span>€10k</span>
                <span>€0</span>
              </div>
              <svg
                viewBox="0 0 560 170"
                preserveAspectRatio="none"
                aria-label="Andamento di ricavi e costi dei corrieri"
              >
                <path
                  className="grid-lines"
                  d="M0 10H560M0 60H560M0 110H560M0 160H560"
                />
                <path
                  className="area"
                  d="M0 125 C70 115 80 90 140 98 S220 50 280 72 S360 45 420 48 S500 12 560 28 V170H0Z"
                />
                <path
                  className="revenue-line"
                  d="M0 125 C70 115 80 90 140 98 S220 50 280 72 S360 45 420 48 S500 12 560 28"
                />
                <path
                  className="cost-line"
                  d="M0 145 C80 138 100 125 140 130 S210 102 280 112 S350 90 420 95 S490 68 560 78"
                />
              </svg>
              <div className="chart-x">
                <span>Gen</span>
                <span>Feb</span>
                <span>Mar</span>
                <span>Apr</span>
                <span>Mag</span>
                <span>Giu</span>
              </div>
            </div>
          </div>
          <div className="card markup-card">
            <div className="card-heading">
              <div>
                <h2>Regole di ricarico</h2>
                <p>Margine predefinito per corriere</p>
              </div>
              <button className="settings-mini">
                <Icon name="settings" size={17} />
              </button>
            </div>
            {(["poste", "brt", "dhl"] as const).map((name) => (
              <div className="markup-row" key={name}>
                <span
                  className={`courier-logo small-logo logo-${
                    name === "poste" ? "yellow" : name === "brt" ? "red" : "dhl"
                  }`}
                >
                  {name === "poste" ? "PI" : name.toUpperCase()}
                </span>
                <div>
                  <strong>
                    {name === "poste"
                      ? "Poste Italiane"
                      : name === "brt"
                        ? "BRT"
                        : "DHL Express"}
                  </strong>
                  <small>Ricarico base</small>
                </div>
                <label>
                  <input
                    value={markup[name]}
                    onChange={(event) => {
                      setSaved(false)
                      setMarkup({ ...markup, [name]: event.target.value })
                    }}
                  />
                  <span>%</span>
                </label>
              </div>
            ))}
            <Button
              onClick={() => setSaved(true)}
              icon={saved ? "check" : undefined}
              className="wide-button"
            >
              {saved ? "Regole salvate" : "Salva regole di ricarico"}
            </Button>
          </div>
        </section>
        <section className="table-card card client-table">
          <div className="card-heading table-heading">
            <div>
              <h2>Gestione clienti B2B</h2>
              <p>Gestisci account, piani e performance dei clienti</p>
            </div>
            <div className="table-tools">
              <label>
                <Icon name="search" size={17} />
                <input placeholder="Cerca clienti" />
              </label>
              <button className="filter-button">
                <Icon name="sliders" size={17} /> Filtri
              </button>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>CLIENTE</th>
                  <th>CONTATTO</th>
                  <th>PIANO</th>
                  <th>SPEDIZIONI</th>
                  <th>RICAVI</th>
                  <th>STATO</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.name}>
                    <td>
                      <div className="client-cell">
                        <span>{client.initials}</span>
                        <strong>{client.name}</strong>
                      </div>
                    </td>
                    <td>{client.contact}</td>
                    <td>
                      <span className="plan-pill">{client.plan}</span>
                    </td>
                    <td>{client.shipments}</td>
                    <td>
                      <strong>{client.revenue}</strong>
                    </td>
                    <td>
                      <span
                        className={`status ${
                          client.status === "Attivo"
                            ? "status-green"
                            : "status-orange"
                        }`}
                      >
                        {client.status}
                      </span>
                    </td>
                    <td>
                      <button className="row-menu">•••</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  )
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("home")
  const screens: {
    id: Screen
    label: string
    shortLabel: string
    icon: IconName
  }[] = [
    {
      id: "home",
      label: "Schermata iniziale",
      shortLabel: "Inizio",
      icon: "home",
    },
    {
      id: "couriers",
      label: "Scelta corriere",
      shortLabel: "Corrieri",
      icon: "truck",
    },
    {
      id: "business",
      label: "Dashboard aziendale",
      shortLabel: "Aziende",
      icon: "briefcase",
    },
    {
      id: "admin",
      label: "Super amministratore",
      shortLabel: "Admin",
      icon: "shield",
    },
  ]
  return (
    <div className={`app app-${screen}`}>
      <div className="prototype-nav">
        <div className="prototype-brand">
          <span>ANTEPRIMA PRODOTTO</span>
          <strong>Piattaforma Muvpack</strong>
        </div>
        <div className="screen-tabs">
          {screens.map((item, index) => (
            <button
              className={screen === item.id ? "active" : ""}
              onClick={() => setScreen(item.id)}
              key={item.id}
              aria-label={item.shortLabel}
            >
              <span>{index + 1}</span>
              <Icon name={item.icon} size={17} />
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="prototype-canvas">
        {screen === "home" && <HomeScreen setScreen={setScreen} />}
        {screen === "couriers" && <CorrieriScreen setScreen={setScreen} />}
        {screen === "business" && <BusinessDashboard />}
        {screen === "admin" && <AdminDashboard />}
      </div>
    </div>
  )
}
