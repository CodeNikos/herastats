import { Helmet } from 'react-helmet-async';
import { buildCanonicalPath, DEFAULT_OG_IMAGE, getSiteUrl } from '../config/siteConfig';

export default function SeoHead({
  title,
  description,
  pathname = '/',
  search = '',
  image,
  noindex = false,
  jsonLd = null
}) {
  const siteUrl = getSiteUrl();
  const canonical = buildCanonicalPath(pathname, search);
  const ogImage = image
    ? image.startsWith('http')
      ? image
      : `${siteUrl}${image.startsWith('/') ? image : `/${image}`}`
    : `${siteUrl}${DEFAULT_OG_IMAGE}`;

  return (
    <Helmet>
      {title ? <title>{title}</title> : null}
      {description ? <meta name="description" content={description} /> : null}
      {noindex ? <meta name="robots" content="noindex,nofollow" /> : null}
      {canonical ? <link rel="canonical" href={canonical} /> : null}

      {title ? <meta property="og:title" content={title} /> : null}
      {description ? <meta property="og:description" content={description} /> : null}
      {canonical ? <meta property="og:url" content={canonical} /> : null}
      <meta property="og:type" content="website" />
      <meta property="og:locale" content="es_ES" />
      {ogImage ? <meta property="og:image" content={ogImage} /> : null}

      {title ? <meta name="twitter:card" content="summary_large_image" /> : null}
      {title ? <meta name="twitter:title" content={title} /> : null}
      {description ? <meta name="twitter:description" content={description} /> : null}
      {ogImage ? <meta name="twitter:image" content={ogImage} /> : null}

      {jsonLd ? (
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      ) : null}
    </Helmet>
  );
}
