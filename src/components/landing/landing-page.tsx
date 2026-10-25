import Image from "next/image";
import Link from "next/link";

import { appPath } from "@/lib/app-path";

import styles from "./landing-page.module.css";

const services = [
  { emoji: "✅", label: "Voting", implemented: true },
  { emoji: "✅", label: "Recreation", implemented: true },
  { emoji: "🏗️", label: "Building permits", implemented: false },
  { emoji: "🚛", label: "Waste collection", implemented: false },
  { emoji: "💧", label: "Water bills", implemented: false },
  { emoji: "🧸", label: "Child care", implemented: false },
  { emoji: "🐾", label: "Animal services", implemented: false },
  { emoji: "🅿️", label: "Parking permits", implemented: false },
  { emoji: "🩺", label: "Public health", implemented: false },
  { emoji: "🌱", label: "Tree planting", implemented: false },
  { emoji: "🏠", label: "Housing support", implemented: false },
  { emoji: "🚧", label: "Road repairs", implemented: false },
  { emoji: "🗺️", label: "City planning", implemented: false },
  { emoji: "🐕", label: "Pet licences", implemented: false },
  { emoji: "🎨", label: "Public art", implemented: false },
  { emoji: "🏡", label: "Property taxes", implemented: false },
  { emoji: "⛴️", label: "Island ferries", implemented: false },
  { emoji: "🔇", label: "Noise complaints", implemented: false },
  { emoji: "🏘️", label: "Community centres", implemented: false },
  { emoji: "🏪", label: "Business licences", implemented: false },
  { emoji: "🏊", label: "Swimming", implemented: false },
  { emoji: "❄️", label: "Snow clearing", implemented: false },
  { emoji: "💍", label: "Marriage licences", implemented: false },
  { emoji: "♻️", label: "Recycling", implemented: false },
  { emoji: "🌳", label: "Street trees", implemented: false },
  { emoji: "🏕️", label: "Summer camps", implemented: false },
  { emoji: "🎫", label: "Parking tickets", implemented: false },
  { emoji: "🖌️", label: "Arts grants", implemented: false },
  { emoji: "🚰", label: "Water quality", implemented: false },
  { emoji: "🧓", label: "Senior services", implemented: false },
  { emoji: "🚲", label: "Bike lanes", implemented: false },
  { emoji: "🏢", label: "Affordable housing", implemented: false },
  { emoji: "🥗", label: "Food safety", implemented: false },
  { emoji: "⛸️", label: "Skating", implemented: false },
  { emoji: "🍃", label: "Green bins", implemented: false },
  { emoji: "🌻", label: "Community gardens", implemented: false },
  { emoji: "💼", label: "Employment support", implemented: false },
  { emoji: "🏛️", label: "Historic sites", implemented: false },
  { emoji: "📅", label: "Facility bookings", implemented: false },
  { emoji: "🐈", label: "Animal adoption", implemented: false },
  { emoji: "💡", label: "Street lighting", implemented: false },
  { emoji: "💬", label: "Public consultations", implemented: false },
  { emoji: "💉", label: "Health clinics", implemented: false },
  { emoji: "📐", label: "Development plans", implemented: false },
  { emoji: "🏖️", label: "Beaches", implemented: false },
  { emoji: "⚽", label: "Sports fields", implemented: false },
  { emoji: "⚖️", label: "Bylaw enforcement", implemented: false },
  { emoji: "🌊", label: "Flood prevention", implemented: false },
  { emoji: "♿", label: "Accessibility", implemented: false },
  { emoji: "🛏️", label: "Shelter services", implemented: false },
  { emoji: "🎒", label: "After-school care", implemented: false },
  { emoji: "🎪", label: "Event permits", implemented: false },
  { emoji: "🧽", label: "Graffiti removal", implemented: false },
  { emoji: "🏋️", label: "Fitness classes", implemented: false },
  { emoji: "🕳️", label: "Potholes", implemented: false },
  { emoji: "🗑️", label: "Waste depots", implemented: false },
  { emoji: "🧱", label: "Heritage buildings", implemented: false },
  { emoji: "🤝", label: "Community grants", implemented: false },
  { emoji: "🧳", label: "Newcomer services", implemented: false },
  { emoji: "☎️", label: "311 requests", implemented: false },
];

export function LandingPage() {
  return (
    <div className={styles.landing}>
      <a className={styles.skipLink} href="#main">
        Skip to content
      </a>
      <header className={styles.header}>
        <Link className={styles.wordmark} href="/" aria-label="Toronto One home">
          <Image src={appPath("/landing/brand.svg")} alt="" width={156} height={56} />
        </Link>
      </header>
      <main id="main">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <h1 id="hero-title">
              <span className={styles.heroGreeting}>Hey, Toronto.</span>
              <span className={styles.heroPromise}>
                I&#39;ll do the{" "}
                <span className={styles.heroLastLine}>running around.</span>
              </span>
            </h1>
            <p className={styles.heroSubtitle}>City services, one message away.</p>
            <Link className={styles.heroCta} href="/chat">
              Start chat
            </Link>
          </div>
          <div className={styles.cityPostcard} aria-hidden="true">
            <picture>
              <img
                src={appPath("/landing/toronto-skyline-1536.webp")}
                srcSet={`${appPath("/landing/toronto-skyline-768.webp")} 768w, ${appPath("/landing/toronto-skyline-1536.webp")} 1536w`}
                sizes="(max-width: 600px) 116vw, (max-width: 1100px) 90vw, (min-width: 1600px) min(84vw, 1440px), 86vw"
                width={1536}
                height={1024}
                alt=""
                decoding="async"
              />
            </picture>
          </div>
          <div className={styles.mascotStage}>
            <picture>
              <img
                className={styles.mascot}
                src={appPath("/landing/raccoon-2048.webp")}
                srcSet={`${appPath("/landing/raccoon-768.webp")} 768w, ${appPath("/landing/raccoon-1024.webp")} 1024w, ${appPath("/landing/raccoon-1536.webp")} 1536w, ${appPath("/landing/raccoon-2048.webp")} 2048w`}
                sizes="(max-width: 600px) 126vw, (max-width: 1100px) 78vw, min(64vw, 1100px)"
                width={2048}
                height={2048}
                alt="Toronto One’s original raccoon companion in front of an illustrated Toronto skyline."
                fetchPriority="high"
                loading="eager"
                decoding="async"
              />
            </picture>
          </div>
        </section>
        <section
          className={styles.services}
          id="services"
          aria-labelledby="services-title"
        >
          <h2 id="services-title">
            A whole city.
            <br />
            <span>One conversation.</span>
          </h2>
          <p className={styles.fieldNote}>
            This demo includes Voting and Recreation. We hope to bring every service on
            this list together in Toronto One.
          </p>
          <p className={styles.srOnly} id="field-description">
            A static field of 60 City services and programs. Voting and Recreation are
            included in the demo. All remaining services represent future possibilities.
          </p>
          <div className={styles.serviceField} aria-describedby="field-description">
            {services.map(({ emoji, label, implemented }) => (
              <span
                key={label}
                className={`${styles.serviceItem}${implemented ? ` ${styles.serviceActive}` : ""}`}
              >
                <span className={styles.serviceEmoji} aria-hidden="true">
                  {emoji}
                </span>
                <span className={styles.serviceLabel}>{label}</span>
              </span>
            ))}
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <p className={styles.footerCredit}>
          Built for the{" "}
          <a
            href="https://better-toronto.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Better Toronto Build A Thon
          </a>{" "}
          <span className={styles.footerAuthor}>
            by{" "}
            <a href="https://tomsanee.com/" target="_blank" rel="noopener noreferrer">
              Tom Sanee
            </a>
            <span className={styles.footerLeaf} aria-hidden="true">
              🍁
            </span>
          </span>
        </p>
      </footer>
    </div>
  );
}
