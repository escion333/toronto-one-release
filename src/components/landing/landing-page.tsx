import Image from "next/image";
import Link from "next/link";

import { appPath } from "@/lib/app-path";

import styles from "./landing-page.module.css";

const services = [
  { emoji: "✅", label: "Recreation", highlighted: true },
  { emoji: "🏗️", label: "Building permits", highlighted: false },
  { emoji: "🚛", label: "Waste collection", highlighted: false },
  { emoji: "💧", label: "Water bills", highlighted: false },
  { emoji: "🧸", label: "Child care", highlighted: false },
  { emoji: "🐾", label: "Animal services", highlighted: false },
  { emoji: "🅿️", label: "Parking permits", highlighted: false },
  { emoji: "🩺", label: "Public health", highlighted: false },
  { emoji: "🌱", label: "Tree planting", highlighted: false },
  { emoji: "🏠", label: "Housing support", highlighted: false },
  { emoji: "🚧", label: "Road repairs", highlighted: false },
  { emoji: "🗺️", label: "City planning", highlighted: false },
  { emoji: "🐕", label: "Pet licences", highlighted: false },
  { emoji: "🎨", label: "Public art", highlighted: false },
  { emoji: "🏡", label: "Property taxes", highlighted: false },
  { emoji: "⛴️", label: "Island ferries", highlighted: false },
  { emoji: "🔇", label: "Noise complaints", highlighted: false },
  { emoji: "🏘️", label: "Community centres", highlighted: false },
  { emoji: "🏪", label: "Business licences", highlighted: false },
  { emoji: "🏊", label: "Swimming", highlighted: false },
  { emoji: "❄️", label: "Snow clearing", highlighted: false },
  { emoji: "💍", label: "Marriage licences", highlighted: false },
  { emoji: "♻️", label: "Recycling", highlighted: false },
  { emoji: "🌳", label: "Street trees", highlighted: false },
  { emoji: "🏕️", label: "Summer camps", highlighted: false },
  { emoji: "🎫", label: "Parking tickets", highlighted: false },
  { emoji: "🖌️", label: "Arts grants", highlighted: false },
  { emoji: "🚰", label: "Water quality", highlighted: false },
  { emoji: "🧓", label: "Senior services", highlighted: false },
  { emoji: "🚲", label: "Bike lanes", highlighted: false },
  { emoji: "🏢", label: "Affordable housing", highlighted: false },
  { emoji: "🥗", label: "Food safety", highlighted: false },
  { emoji: "⛸️", label: "Skating", highlighted: false },
  { emoji: "🍃", label: "Green bins", highlighted: false },
  { emoji: "🌻", label: "Community gardens", highlighted: false },
  { emoji: "💼", label: "Employment support", highlighted: false },
  { emoji: "🏛️", label: "Historic sites", highlighted: false },
  { emoji: "📅", label: "Facility bookings", highlighted: false },
  { emoji: "🐈", label: "Animal adoption", highlighted: false },
  { emoji: "💡", label: "Street lighting", highlighted: false },
  { emoji: "💬", label: "Public consultations", highlighted: false },
  { emoji: "🗳️", label: "Voting", highlighted: false },
  { emoji: "💉", label: "Health clinics", highlighted: false },
  { emoji: "📐", label: "Development plans", highlighted: false },
  { emoji: "🏖️", label: "Beaches", highlighted: false },
  { emoji: "⚽", label: "Sports fields", highlighted: false },
  { emoji: "⚖️", label: "Bylaw enforcement", highlighted: false },
  { emoji: "🌊", label: "Flood prevention", highlighted: false },
  { emoji: "♿", label: "Accessibility", highlighted: false },
  { emoji: "🛏️", label: "Shelter services", highlighted: false },
  { emoji: "🎒", label: "After-school care", highlighted: false },
  { emoji: "🎪", label: "Event permits", highlighted: false },
  { emoji: "🧽", label: "Graffiti removal", highlighted: false },
  { emoji: "🏋️", label: "Fitness classes", highlighted: false },
  { emoji: "🕳️", label: "Potholes", highlighted: false },
  { emoji: "🗑️", label: "Waste depots", highlighted: false },
  { emoji: "🧱", label: "Heritage buildings", highlighted: false },
  { emoji: "🤝", label: "Community grants", highlighted: false },
  { emoji: "🧳", label: "Newcomer services", highlighted: false },
  { emoji: "☎️", label: "311 requests", highlighted: false },
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
            <p className={styles.heroSubtitle}>Find your next activity in Toronto.</p>
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
            Explore City recreation programs, check the details and plan your next
            outing. The rest of this list shows what Toronto One could bring together.
          </p>
          <p className={styles.srOnly} id="field-description">
            A static field of 60 City services and programs. Recreation is featured in
            the current demo. The other labels show the wider vision for Toronto One.
          </p>
          <div className={styles.serviceField} aria-describedby="field-description">
            {services.map(({ emoji, label, highlighted }) => (
              <span
                key={label}
                className={`${styles.serviceItem}${highlighted ? ` ${styles.serviceActive}` : ""}`}
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
