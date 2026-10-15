import {useEffect, useMemo, useState} from 'react';
import {API_BASE_URL} from '../config.js';

const GITHUB_USER = 'ginoclement';
const EXCLUDED = new Set(['ginoclement.github.io']);

// GitHub's linguist colors for the languages likely to show up.
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

function linkAccent(title) {
  let hash = 0;
  for (const ch of title) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${hash}, 55%, 52%)`;
}

const C = 500; // SVG center
const APP_RINGS = [150, 225];
const REPO_RINGS = [310, 385, 455];
const PER_RING = [6, 8, 9, 11, 13];

/** Distributes items across rings, assigning radius, phase, and period. */
function toOrbits(items, rings, startRing = 0) {
  const placed = [];
  let ring = 0;
  let slot = 0;
  for (const item of items) {
    const capacity = PER_RING[startRing + ring] ?? 12;
    if (slot >= capacity && ring < rings.length - 1) {
      ring++;
      slot = 0;
    }
    const r = rings[ring];
    placed.push({
      ...item,
      r,
      // Kepler-ish: outer rings revolve slower.
      period: Math.round((r / 100) ** 1.5 * 36),
      phase: (slot / Math.min(PER_RING[startRing + ring] ?? 12, 14)) + ring * 0.13
    });
    slot++;
  }
  return placed;
}

function OrbitNode({node, size, color, label, sublabel, href, alwaysLabel}) {
  const x = C + node.r;
  const spin = {
    animationDuration: `${node.period}s`,
    animationDelay: `-${node.phase * node.period}s`
  };
  return (
    <g className="orbit-spin" style={spin}>
      <g
        className="orbit-counter"
        style={{...spin, transformOrigin: `${x}px ${C}px`}}
      >
        <a href={href} target="_blank" rel="noreferrer" className={`orbit-node${alwaysLabel ? '' : ' quiet'}`}>
          <circle cx={x} cy={C} r={size + 8} className="halo" fill={color} />
          <circle cx={x} cy={C} r={size} fill={color} stroke="#fff" strokeWidth="2" />
          <text x={x} y={C + size + 16} textAnchor="middle" className="orbit-label">
            {label}
          </text>
          {sublabel && (
            <text x={x} y={C + size + 29} textAnchor="middle" className="orbit-sublabel">
              {sublabel}
            </text>
          )}
          <title>{`${label}${sublabel ? ` — ${sublabel}` : ''}`}</title>
        </a>
      </g>
    </g>
  );
}

export default function ProjectsOrbit() {
  const [repos, setRepos] = useState(null);
  const [links, setLinks] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (API_BASE_URL) {
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

  const {appOrbits, repoOrbits} = useMemo(() => {
    return {
      appOrbits: toOrbits(links ?? [], APP_RINGS, 0),
      repoOrbits: toOrbits((repos ?? []).slice(0, 30), REPO_RINGS, APP_RINGS.length)
    };
  }, [links, repos]);

  return (
    <div className="view-pad">
      <p className="view-caption">
        The wider system: apps and sites on the inner orbits, GitHub repositories
        further out. Hover to pause, click to visit.
      </p>

      <div className="orbit-map-wrap">
        <svg viewBox="0 0 1000 1000" className="orbit-map" role="img" aria-label="Projects orbit map">
          {[...APP_RINGS, ...REPO_RINGS].map((r) => (
            <circle key={r} cx={C} cy={C} r={r} className="orbit-ring" />
          ))}
          <circle cx={C} cy={C} r={46} fill="#1c1c22" />
          <text x={C} y={C + 7} textAnchor="middle" className="orbit-sun">
            GC
          </text>
          {appOrbits.map((link) => (
            <OrbitNode
              key={link.url}
              node={link}
              size={17}
              color={linkAccent(link.title)}
              label={link.title}
              sublabel={link.tag || null}
              href={link.url}
              alwaysLabel
            />
          ))}
          {repoOrbits.map((repo) => (
            <OrbitNode
              key={repo.id}
              node={repo}
              size={Math.min(14, 7 + repo.stargazers_count)}
              color={LANGUAGE_COLORS[repo.language] ?? '#8a8a9a'}
              label={repo.name}
              sublabel={repo.stargazers_count > 0 ? `★ ${repo.stargazers_count}` : null}
              href={repo.html_url}
            />
          ))}
        </svg>
      </div>

      {links?.length > 0 && (
        <>
          <h3 className="projects-subhead">Apps &amp; sites</h3>
          <div className="projects-grid">
            {links.map((link) => {
              const accent = linkAccent(link.title);
              let domain = '';
              try {
                domain = new URL(link.url).host;
              } catch {
                domain = link.url;
              }
              return (
                <a
                  key={link.url}
                  className="project-card"
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{'--accent': accent}}
                >
                  <div className="app-head">
                    <span className="monogram" style={{background: accent}}>
                      {link.title.slice(0, 1).toUpperCase()}
                    </span>
                    <h3>{link.title}</h3>
                  </div>
                  {link.description && <p>{link.description}</p>}
                  <div className="project-meta">
                    <span>{domain}</span>
                    {link.tag && <span className="topics-inline">{link.tag}</span>}
                  </div>
                </a>
              );
            })}
          </div>
        </>
      )}

      <h3 className="projects-subhead">On GitHub</h3>
      {failed && (
        <p className="projects-note">
          Couldn't reach GitHub — see{' '}
          <a href={`https://github.com/${GITHUB_USER}`}>github.com/{GITHUB_USER}</a>.
        </p>
      )}
      {!failed && !repos && <p className="projects-note">Loading…</p>}
      <div className="projects-grid">
        {repos?.map((repo) => {
          const accent = LANGUAGE_COLORS[repo.language] ?? '#8a8a9a';
          return (
            <a
              key={repo.id}
              className="project-card"
              href={repo.html_url}
              target="_blank"
              rel="noreferrer"
              style={{'--accent': accent}}
            >
              <h3>{repo.name}</h3>
              {repo.description && <p>{repo.description}</p>}
              <div className="project-meta">
                {repo.language && (
                  <span className="lang">
                    <i style={{background: accent}} />
                    {repo.language}
                  </span>
                )}
                {repo.stargazers_count > 0 && <span>★ {repo.stargazers_count}</span>}
                <span>{new Date(repo.pushed_at).getFullYear()}</span>
              </div>
              {repo.topics?.length > 0 && (
                <div className="topics">
                  {repo.topics.slice(0, 4).map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
              )}
            </a>
          );
        })}
      </div>
    </div>
  );
}
