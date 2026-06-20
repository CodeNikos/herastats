import { getSiteUrl } from '../config/siteConfig';

export function buildWebSiteJsonLd() {
  const siteUrl = getSiteUrl();
  if (!siteUrl) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Herastats',
    url: siteUrl,
    description:
      'Estadísticas, calendarios, brackets y resultados en vivo para torneos de ultimate frisbee y fútbol.',
    publisher: {
      '@type': 'Organization',
      name: 'Herastats',
      logo: {
        '@type': 'ImageObject',
        url: `${siteUrl}/Hera_logo.png`
      }
    }
  };
}

export function buildSportsOrganizationJsonLd(tournament) {
  const siteUrl = getSiteUrl();
  if (!tournament?.name) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsOrganization',
    name: tournament.name,
    url: siteUrl ? `${siteUrl}/tourn_home/${tournament.torneo_id ?? tournament.id}` : undefined,
    sport: tournament.sport_name || undefined,
    location: tournament.country || tournament.location || undefined
  };
}

export function buildSportsEventJsonLd({ homeTeam, awayTeam, gameDate, location, tournamentName }) {
  if (!homeTeam || !awayTeam) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: `${homeTeam} vs ${awayTeam}`,
    sport: tournamentName || 'Deporte',
    startDate: gameDate || undefined,
    location: location
      ? {
          '@type': 'Place',
          name: location
        }
      : undefined,
    competitor: [
      { '@type': 'SportsTeam', name: homeTeam },
      { '@type': 'SportsTeam', name: awayTeam }
    ]
  };
}
