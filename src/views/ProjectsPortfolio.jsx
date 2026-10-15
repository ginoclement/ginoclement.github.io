import {useEffect, useRef, useState} from 'react';
import {API_BASE_URL, faceUrl} from '../config.js';
import ProjectHedron from './ProjectHedron.jsx';

const GITHUB_USER = 'ginoclement';
const EXCLUDED = new Set(['ginoclement.github.io']);

const LANGUAGE_COLORS = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Python: '#3572A5',
  Java: '#b07219',
  C: '#555555',
  'C++': '#f34b7d',
  'C#': '#178600',
  Go: '#00ADD8',
  Rust: '#dea584',
  Ruby: '#701516',
  Shell: '#89e051',
  HTML: '#e34c26',
  CSS: '#563d7c',
  SCSS: '#c6538c',
  'Jupyter Notebook': '#DA5B0B',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  PHP: '#4F5D95'
};

function accentHue(title) {
  let hash = 0;
  for (const ch of title) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return hash;
}

// Live iframes are desktop-only: on touch devices they cost real data and
// battery, and iOS Safari mis-sizes scaled iframes.
const LIVE_PREVIEWS =
  window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
  window.innerWidth > 700;

function domainOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// Bento spans, cycled by position: [columns, rows].
const SPANS = [
  [2, 2],
  [1, 1],
  [1, 1],
  [2, 1],
  [1, 2],
  [1, 1],
  [2, 1],
  [1, 1]
];

/** Marks the tile visible once scrolled into view, for staggered entrances. */
function useReveal() {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      {rootMargin: '60px'}
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, shown];
}

/** One bento tile: live site preview drifting ken-burns style, title on a
 * scrim, details sliding up on hover. */
function Tile({link, index}) {
  const [ref, shown] = useReveal();
  const [cols, rows] = SPANS[index % SPANS.length];
  const hue = accentHue(link.title);
  return (
    <a
      ref={ref}
      className={`po-tile${shown ? ' in' : ''}`}
      href={link.url}
      target="_blank"
      rel="noreferrer"
      style={{
        '--cols': cols,
        '--rows': rows,
        '--accent': `hsl(${hue}, 60%, 50%)`,
        '--delay': `${(index % 8) * 70}ms`,
        '--drift': `${16 + ((index * 7) % 9)}s`
      }}
    >
      <div
        className="po-media"
        style={{
          background: `linear-gradient(135deg, hsl(${hue}, 60%, 86%), hsl(${(hue + 45) % 360}, 55%, 68%))`
        }}
      >
        {link.image ? (
          <img
            className="po-shot"
            src={faceUrl(link.image, link.imageV)}
            alt=""
            loading="lazy"
          />
        ) : (
          <span className="po-monogram">{link.title.slice(0, 1).toUpperCase()}</span>
        )}
        {shown && LIVE_PREVIEWS && (
          <iframe
            src={link.url}
            title={`${link.title} preview`}
            loading="lazy"
            tabIndex={-1}
            sandbox="allow-scripts allow-same-origin"
            referrerPolicy="no-referrer"
            onLoad={(e) => {
              e.target.style.opacity = '1';
            }}
          />
        )}
      </div>
      <div className="po-scrim" />
      {link.tag && <span className="po-tag">{link.tag}</span>}
      <div className="po-info">
        <h3>{link.title}</h3>
        <p className="po-detail">
          {link.description && <span>{link.description}</span>}
          <span className="po-domain">{domainOf(link.url)} ↗</span>
        </p>
      </div>
    </a>
  );
}

/** Compact repo card for the marquee rows. */
function RepoCard({repo}) {
  const color = LANGUAGE_COLORS[repo.language] ?? '#8a8a9a';
  return (
    <a className="po-repo" href={repo.html_url} target="_blank" rel="noreferrer">
      <div className="po-repo-shot">
        <img
          src={`https://opengraph.githubassets.com/1/${GITHUB_USER}/${repo.name}`}
          alt=""
          loading="lazy"
          onLoad={(e) => {
            e.target.style.opacity = '1';
          }}
        />
        <span className="po-repo-mono" style={{background: color}}>
          {repo.name.slice(0, 1).toUpperCase()}
        </span>
      </div>
      <div className="po-repo-body">
        <strong>{repo.name}</strong>
        <span className="po-repo-meta">
          {repo.language && (
            <em>
              <i style={{background: color}} />
              {repo.language}
            </em>
          )}
          {repo.stargazers_count > 0 && <em>★ {repo.stargazers_count}</em>}
          <em>{new Date(repo.pushed_at).getFullYear()}</em>
        </span>
      </div>
    </a>
  );
}

/** Endless marquee row; duplicated content loops seamlessly. */
function Marquee({repos, reverse, duration}) {
  return (
    <div className="po-marquee">
      <div
        className={`po-marquee-track${reverse ? ' reverse' : ''}`}
        style={{animationDuration: `${duration}s`}}
      >
        {[...repos, ...repos].map((repo, i) => (
          <RepoCard key={`${repo.id}-${i}`} repo={repo} />
        ))}
      </div>
    </div>
  );
}

export default function ProjectsPortfolio() {
  const [repos, setRepos] = useState(null);
  const [links, setLinks] = useState(null);
  const [failed, setFailed] = useState(false);
  const [faceStyle, setFaceStyle] = useState('drift');

  useEffect(() => {
    if (API_BASE_URL) {
      fetch(`${API_BASE_URL}/api/settings`)
        .then((r) => (r.ok ? r.json() : {}))
        .then((json) => json.faceStyle && setFaceStyle(json.faceStyle))
        .catch(() => {});
      fetch(`${API_BASE_URL}/api/links`)
        .then((r) => (r.ok ? r.json() : {links: []}))
        .then((json) => setLinks(json.links ?? []))
        .catch(() => setLinks([]));
    } else {
      setLinks([]);
    }
    fetch(`https://api.github.com/users/${GITHUB_USER}/repos?per_page=100&sort=updated`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((list) =>
        setRepos(
          list
            .filter((r) => !r.fork && !EXCLUDED.has(r.name))
            .sort(
              (a, b) =>
                b.stargazers_count - a.stargazers_count ||
                new Date(b.pushed_at) - new Date(a.pushed_at)
            )
        )
      )
      .catch(() => {
        setRepos([]);
        setFailed(true);
      });
  }, []);

  const half = repos ? Math.ceil(repos.length / 2) : 0;

  return (
    <div className="view-pad po-wrap">
      <p className="view-caption">
        Selected work — live previews, not screenshots. Hover a tile; click to
        visit.
      </p>
      {links?.length >= 2 && <ProjectHedron links={links} faceStyle={faceStyle} />}
      <div className="po-grid">
        {(links ?? []).map((link, i) => (
          <Tile key={link.url} link={link} index={i} />
        ))}
        {links !== null && links.length === 0 && (
          <p className="projects-note">No project links published yet.</p>
        )}
      </div>
      <h3 className="projects-subhead">On GitHub</h3>
      {failed && (
        <p className="projects-note">
          Couldn't reach GitHub — see{' '}
          <a href={`https://github.com/${GITHUB_USER}`}>github.com/{GITHUB_USER}</a>.
        </p>
      )}
      {!failed && !repos && <p className="projects-note">Loading…</p>}
      {repos?.length > 0 && (
        <>
          <Marquee repos={repos.slice(0, half)} duration={55} />
          {repos.length > 1 && (
            <Marquee repos={repos.slice(half)} reverse duration={70} />
          )}
        </>
      )}
    </div>
  );
}
