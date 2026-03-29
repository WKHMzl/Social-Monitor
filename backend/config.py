import json
import sqlite3
from typing import Dict, Any
from models import Config


DEFAULT_CONFIG = {
    "positive_keywords": [
        # ── Hiring intent direto ─────────────────────────────────────────────
        "looking to hire",
        "need to hire",
        "want to hire",
        "looking to bring on",
        "hiring a developer",
        "hiring a programmer",
        "hiring an engineer",
        "hiring a freelancer",
        "developer needed",
        "programmer wanted",
        "developer wanted",
        "engineer needed",
        "freelancer needed",
        "need a developer",
        "need a programmer",
        "need a coder",
        "need a freelancer",
        "need a contractor",
        "looking for a developer",
        "looking for a programmer",
        "looking for a coder",
        "looking for a freelancer",
        "looking for someone to build",
        "looking for someone to help",
        "looking for help building",
        "need someone to build",
        "need someone to create",
        "need someone to develop",
        "need someone to automate",
        "need someone who can",
        "seeking a developer",
        "seeking a freelancer",
        "open to freelancers",
        "accepting proposals",
        "dm me your rates",
        "dm your portfolio",
        # ── Build requests (buyer signal forte) ──────────────────────────────
        "build an app",
        "build a website",
        "build a web app",
        "build a saas",
        "build a bot",
        "build a chatbot",
        "build a scraper",
        "build a dashboard",
        "build an mvp",
        "build my mvp",
        "build my app",
        "build my website",
        "build my saas",
        "need an app built",
        "need a website built",
        "need a bot built",
        "need help building",
        # ── Automação / AI ────────────────────────────────────────────────────
        "automate my",
        "automate our",
        "need automation",
        "workflow automation",
        "process automation",
        "automation developer",
        "automation specialist",
        "chatbot developer",
        "ai developer",
        "ai engineer",
        "build an ai",
        "ai agent",
        "need a chatbot",
        "need a bot",
        "n8n developer",
        "make.com developer",
        "zapier developer",
        # ── Scraping / Data ───────────────────────────────────────────────────
        "web scraping",
        "data scraping",
        "need a scraper",
        "scraper developer",
        "data extraction",
        "lead scraping",
        # ── Integrações / API ─────────────────────────────────────────────────
        "api integration",
        "api developer",
        "crm integration",
        "shopify developer",
        "wordpress developer",
        "woocommerce developer",
        # ── RevOps / Marketing Tech ───────────────────────────────────────────
        "google tag manager",
        "gtm setup",
        "tracking setup",
        "conversion tracking",
        "facebook pixel",
        "server side tracking",
        # ── Budget / Pagamento ────────────────────────────────────────────────
        "budget",
        "paid project",
        "willing to pay",
        "hourly rate",
        "fixed price",
        "project rate",
        "monthly retainer",
        "paid gig",
        "paying well",
        "competitive pay",
        # ── Contract signals ──────────────────────────────────────────────────
        "contract work",
        "contract position",
        "contract developer",
        "freelance developer",
        "freelance project",
        "short-term project",
        "long-term project",
        "ongoing work",
        "ongoing project",
        "part-time contractor",
        # ── Roles (stack moderno) ─────────────────────────────────────────────
        "full stack",
        "fullstack developer",
        "frontend developer",
        "backend developer",
        "web developer",
        "mobile developer",
        "app developer",
        "software developer",
        "software engineer",
        "react developer",
        "python developer",
        "node developer",
        "typescript developer",
        "next.js developer",
        "nextjs developer",
        "devops engineer",
        "cloud engineer",
        "data engineer",
    ],
    "negative_keywords": [
        # ── Self-promotion / FOR HIRE (posts de concorrentes) ─────────────────
        "[for hire]",
        "for hire]",
        "available for hire",
        "available to work",
        "i am available",
        "i'm available",
        "open to work",
        "seeking work",
        "looking for work",
        "seeking employment",
        "job hunting",
        "resume",
        "my services",
        "i offer",
        "i provide",
        "i specialize in",
        "services offered",
        "hire me",
        "please hire me",
        "my rates",
        # ── Showcase / portfolio noise ────────────────────────────────────────
        "i built",
        "i created",
        "i made",
        "just launched",
        "just released",
        "portfolio review",
        "feedback on my",
        "rate my",
        "show off",
        # ── Cofounder / equity deals (ruído enorme em r/startups, r/Entrepreneur)
        "looking for a cofounder",
        "looking for cofounder",
        "technical cofounder",
        "cofounder wanted",
        "co-founder wanted",
        "seeking cofounder",
        "need a cofounder",
        # ── Sem pagamento / bad deals ──────────────────────────────────────────
        "unpaid",
        "exposure",
        "equity only",
        "for equity",
        "profit share only",
        "free work",
        "volunteer",
        "no budget",
        "for free",
        "revenue share only",
        "sweat equity",
        "no pay",
        # ── Projetos acadêmicos / pessoais sem $ ──────────────────────────────
        "school project",
        "class project",
        "university project",
        "homework",
        "college project",
        "learning project",
    ],
    "subreddits": [
        # ── Core hiring / freelance ──────────────────────────────────────────
        "forhire",
        "freelance",
        "freelance_forhire",
        "freelanceprogramming",
        "B2BForHire",
        "hiring",
        "devjobs",
        "jobnetworking",
        "RemoteWorkers",
        "slavelabour",              # gigs rápidos e reais, baixa concorrência
        # ── Startup / Indie ──────────────────────────────────────────────────
        "startup",
        "startups",
        "Entrepreneur",
        "EntrepreneurRideAlong",
        "sideproject",
        "IndieHackers",
        "IndieDev",
        "Startup_Ideas",
        "TechStartups",
        "AppIdeas",                 # ideias que precisam de dev
        # ── SaaS ─────────────────────────────────────────────────────────────
        "saas",
        "SaaSFounders",
        "saasdevelopers",
        "micro_saas",
        # ── E-commerce operators ─────────────────────────────────────────────
        "ecommerce",
        "Shopify",
        "shopifydev",               # clientes Shopify mais técnicos
        "woocommerce",
        "smallbusiness",
        "dropshipping",             # operadores precisando de ferramentas custom
        "AmazonFBA",                # automação, dashboards, scrapers inventário
        # ── Web dev geral ────────────────────────────────────────────────────
        "webdev",                   # thread semanal "Who's Hiring" (3.1M members)
        "wordpress",                # donos de negócio não-técnicos
        "nocode",                   # quem tentou no-code e precisa de dev real
        # ── AI & Automação ───────────────────────────────────────────────────
        "ChatGPT",                  # "build me an AI agent/chatbot" requests
        "automation",               # n8n, Make, pipelines gerais
        "n8n",                      # comunidade n8n específica
        # ── Scraping & Lead Gen ──────────────────────────────────────────────
        "webscraping",              # clientes sempre precisam de scrapers
        "leadsgeneration",          # lead gen automation
        # ── Marketing / RevOps / Performance ────────────────────────────────
        "digital_marketing",        # marketing automation, tracking
        "PPC",                      # GTM Server-Side, CAPI, atribuição
        "SEO",                      # ferramentas e automação SEO
        "GrowthHacking",            # growth ops, funis, tracking
        "FacebookAds",              # media buyers precisam de CAPI/Server-Side GTM
        "GoogleAds",                # scripts, automação, tracking
        "AffiliateMarketing",       # funnels, landing pages, tracking
        # ── Agências digitais ────────────────────────────────────────────────
        "agency",                   # agências digitais terceirizando dev
        # ── CRM / GHL ────────────────────────────────────────────────────────
        "HighLevel",                # agências GHL: snapshots, integrações, automações
        "HubSpot",                  # integrações HubSpot customizadas
        # ── Sales / Outbound / Email Infra ───────────────────────────────────
        "sales",                    # automação de vendas, CRM pipelines
        "cold_email",               # email infra (Instantly/Smartlead) — direto
        "Emailmarketing",           # automação de email marketing
        # ── Real Estate (AI agents + CRM + lead gen) ─────────────────────────
        "realestate",               # 1.7M members — CRM, AI agents, lead scraping
        "RealEstateTechnology",     # tech buyers dentro do setor imobiliário
        # ── Infoprodutos / Criadores de conteúdo ────────────────────────────
        "coursecreators",           # criadores de curso precisando de plataformas/tools
        "juststart",                # niche sites, afiliados, automação de conteúdo
        # ── Python / Data / Finance ──────────────────────────────────────────
        "algotrading",              # 1.8M members — bots Python, dashboards, automação
        # ── Recrutamento / OSINT ─────────────────────────────────────────────
        "recruiting",               # ATS automation, scraping, enriquecimento de dados
    ],
    "poll_interval": 300,  # 5 minutes
    "min_score": -5
}


class ConfigManager:
    """Manage configuration stored in SQLite"""

    def __init__(self, db_path: str = "reddit_monitor.db"):
        self.db_path = db_path

    def get_config(self) -> Config:
        """Get current configuration"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            # Get all config values
            cursor.execute("SELECT key, value FROM config")
            rows = cursor.fetchall()
            conn.close()

            if not rows:
                # Initialize with default config
                return self.save_config(Config(**DEFAULT_CONFIG))

            # Parse stored config
            config_dict = {}
            for key, value in rows:
                try:
                    config_dict[key] = json.loads(value)
                except json.JSONDecodeError:
                    config_dict[key] = value

            return Config(**config_dict)

        except sqlite3.OperationalError:
            # Table doesn't exist yet, return default
            return Config(**DEFAULT_CONFIG)

    def save_config(self, config: Config) -> Config:
        """Save configuration to database"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Create table if not exists
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS config (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)

        # Convert config to dict and save each key
        config_dict = config.model_dump()
        for key, value in config_dict.items():
            if value is None:
                continue  # Don't persist None fields
            # Store lists and complex types as JSON
            if isinstance(value, (list, dict)):
                value = json.dumps(value)
            else:
                value = str(value)

            cursor.execute(
                "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)",
                (key, value)
            )

        conn.commit()
        conn.close()

        return config

    def update_config(self, updates: Dict[str, Any]) -> Config:
        """Update specific config values"""
        current_config = self.get_config()
        config_dict = current_config.model_dump()
        config_dict.update(updates)
        new_config = Config(**config_dict)
        return self.save_config(new_config)
