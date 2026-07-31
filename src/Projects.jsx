import {useEffect, useState} from 'react';

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

export default function Projects({open, onClose}) {
  const [repos, setRepos] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || repos) return;
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
      .catch(() => setFailed(true));
  }, [open, repos]);

  if (!open) return null;

  return (
    <div className="projects-overlay" onClick={onClose}>
      <div className="projects-panel" onClick={(e) => e.stopPropagation()}>
        <div className="projects-head">
          <h2>Projects</h2>
          <button className="close" onClick={onClose} aria-label="Close">×</button>
        </div>
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
    </div>
  );
}
