import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { RefreshCw, Radio, ExternalLink, X, Star, Bookmark, Sun, Moon, Menu, Share2, ChevronUp, Search } from 'lucide-react';
import { FEEDS, fetchFeed } from './FeedService';
import { formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';

const ReaderModal = ({ article, onClose }) => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [usedFallback, setUsedFallback] = useState(false);
  const [showHeroImage, setShowHeroImage] = useState(false);
  const [fontSize, setFontSize] = useState(1); // rem multiplier
  const [readProgress, setReadProgress] = useState(0);
  const [copied, setCopied] = useState(false);
  const bodyRef = useRef(null);

  // Reading progress bar
  const handleScroll = useCallback(() => {
    if (!bodyRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = bodyRef.current;
    const total = scrollHeight - clientHeight;
    setReadProgress(total > 0 ? Math.min(100, Math.round((scrollTop / total) * 100)) : 0);
  }, []);

  // Fix images in modal
  useEffect(() => {
    if (!bodyRef.current || loading) return;
    const baseUrl = article.link ? new URL(article.link).origin : '';
    bodyRef.current.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src') || '';
      const alt = (img.getAttribute('alt') || '').toLowerCase();
      const dataSrc = img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
      const w = parseInt(img.getAttribute('width') || '999');
      const h = parseInt(img.getAttribute('height') || '999');
      const isAvatar = w <= 150 || h <= 150
        || src.includes('avatar') || src.includes('f100x') || src.includes('author')
        || alt.includes('redazione') || alt.includes('autore') || alt.includes('author');
      if (isAvatar) { img.style.display = 'none'; return; }
      img.setAttribute('referrerpolicy', 'no-referrer');
      img.removeAttribute('loading');
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.style.borderRadius = '8px';
      img.style.margin = '1rem 0';
      if (src && src.startsWith('/') && baseUrl) img.setAttribute('src', baseUrl + src);
      if (dataSrc) img.setAttribute('src', dataSrc);
      img.onerror = () => { img.style.display = 'none'; };
    });

    // Deduplicate images by filename stem
    const seenStems = new Set();
    bodyRef.current.querySelectorAll('img').forEach(img => {
      if (img.style.display === 'none') return;
      const src = img.getAttribute('src') || '';
      const stem = src
        .replace(/[-_](scaled|\d+x\d+)(\.[^.?#]+)?(\?.*)?$/, '')
        .split('/').pop()
        .replace(/\.[^.]+$/, '');
      if (!stem) return;
      if (seenStems.has(stem)) { img.remove(); } else { seenStems.add(stem); }
    });
  }, [content, loading]);

  useEffect(() => {
    const loadContent = async () => {
      setLoading(true);
      setUsedFallback(false);
      setShowHeroImage(false);
      setReadProgress(0);

      if (article.link.includes('youtu')) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?]*).*/;
        const videoIdMatch = article.link.match(regExp);
        const videoId = (videoIdMatch && videoIdMatch[2].length === 11) ? videoIdMatch[2] : null;
        if (videoId) {
          const thumb = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
          setContent(`
            <a href="https://www.youtube.com/watch?v=${videoId}" target="_blank" rel="noopener noreferrer"
              style="display:block;position:relative;border-radius:12px;overflow:hidden;text-decoration:none;">
              <img src="${thumb}" alt="Thumbnail"
                style="width:100%;height:auto;display:block;border-radius:12px;"
                onerror="this.src='https://img.youtube.com/vi/${videoId}/hqdefault.jpg'" />
              <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.3);">
                <div style="width:72px;height:72px;background:red;border-radius:50%;display:flex;align-items:center;justify-content:center;">
                  <svg viewBox="0 0 24 24" fill="white" width="36" height="36"><path d="M8 5v14l11-7z"/></svg>
                </div>
              </div>
            </a>
            <p style="margin-top:1.2rem;font-size:1rem;color:var(--text-secondary);">
              Clicca sulla thumbnail per guardare il video su
              <a href="https://www.youtube.com/watch?v=${videoId}" target="_blank" rel="noopener noreferrer"
                style="color:#ff4444;font-weight:600;">YouTube ↗</a>
            </p>
          `);
        } else { setUsedFallback(true); }
        setLoading(false);
        return;
      }

      if (article.fullContent && article.fullContent.trim().length > 100) {
        const tmp = document.createElement('div');
        tmp.innerHTML = article.fullContent;
        tmp.querySelectorAll('a.btn, a.more-link, a[href*="?p="], .wp-block-buttons, .navigation, .nav-links, .sharedaddy, .sd-social').forEach(el => el.remove());
        tmp.querySelectorAll('a').forEach(a => { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); });
        if (article.image) {
          const heroStem = article.image.replace(/[-_](scaled|\d+x\d+)(\.[^.?#]+)?(\?.*)?$/, '').split('/').pop().replace(/\.[^.]+$/, '');
          tmp.querySelectorAll('img').forEach(img => {
            const src = img.getAttribute('src') || '';
            const stem = src.replace(/[-_](scaled|\d+x\d+)(\.[^.?#]+)?(\?.*)?$/, '').split('/').pop().replace(/\.[^.]+$/, '');
            if (stem && stem === heroStem) img.remove();
          });
        }
        tmp.querySelectorAll('img').forEach(img => { img.setAttribute('referrerpolicy', 'no-referrer'); img.style.maxWidth = '100%'; img.style.height = 'auto'; });
        setShowHeroImage(true);
        setContent(tmp.innerHTML);
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`${import.meta.env.PROD ? '' : 'http://127.0.0.1:3001'}/api/read?url=${encodeURIComponent(article.link)}`);
        if (!res.ok) throw new Error('blocked');
        const data = await res.json();
        const tmp = document.createElement('div');
        tmp.innerHTML = data.content;
        tmp.querySelectorAll('a').forEach(a => { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); });
        setShowHeroImage(true);
        setContent(tmp.innerHTML);
      } catch (err) { setUsedFallback(true); }
      setLoading(false);
    };
    loadContent();
  }, [article]);

  const shareArticle = async () => {
    if (navigator.share) {
      await navigator.share({ title: article.title, url: article.link });
    } else {
      await navigator.clipboard.writeText(article.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content glass-panel" onClick={e => e.stopPropagation()}>
        {/* Reading progress bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'var(--border)', borderRadius: '12px 12px 0 0', overflow: 'hidden', zIndex: 10 }}>
          <div style={{ height: '100%', width: `${readProgress}%`, background: 'var(--accent-primary)', transition: 'width 0.1s ease' }} />
        </div>

        <button className="modal-close" onClick={onClose}><X size={24} /></button>

        <div className="modal-header">
          <span className="source-badge">{article.sourceName}</span>
          <h2>{article.title}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <a href={article.link} target="_blank" rel="noopener noreferrer" className="original-link">
              Vedi originale <ExternalLink size={14} />
            </a>
            {/* Font size controls */}
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button onClick={() => setFontSize(f => Math.max(0.8, f - 0.1))}
                style={{ background: 'var(--tag-bg)', border: 'none', color: 'var(--text-secondary)', padding: '0.3rem 0.6rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }} title="Riduci testo">A-</button>
              <button onClick={() => setFontSize(f => Math.min(1.6, f + 0.1))}
                style={{ background: 'var(--tag-bg)', border: 'none', color: 'var(--text-primary)', padding: '0.3rem 0.6rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.95rem' }} title="Ingrandisci testo">A+</button>
            </div>
            {/* Share button */}
            <button onClick={shareArticle}
              style={{ background: 'var(--tag-bg)', border: 'none', color: 'var(--text-secondary)', padding: '0.3rem 0.75rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
              title="Condividi">
              {copied ? '✓ Copiato!' : <><Share2 size={14} /> Condividi</>}
            </button>
          </div>
        </div>

        <div className="modal-body" ref={bodyRef} onScroll={handleScroll} style={{ fontSize: `${fontSize}rem` }}>
          {loading ? (
            <div className="loading-container"><div className="loader"></div><p>Estrazione del testo in corso...</p></div>
          ) : usedFallback ? (
            <div className="article-html">
              {article.image && (
                <img src={article.image} alt={article.title} referrerPolicy="no-referrer"
                  style={{ width: '100%', maxHeight: '400px', objectFit: 'cover', borderRadius: '8px', marginBottom: '1.5rem' }} />
              )}
              <p style={{ fontSize: '1.15rem', lineHeight: '1.9' }}>{article.snippet}</p>
              <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'var(--tag-bg)', borderRadius: '12px', textAlign: 'center' }}>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  ⚠️ Questo sito protegge i contenuti. Continua a leggere sul sito originale.
                </p>
                <a href={article.link} target="_blank" rel="noopener noreferrer"
                  style={{ background: 'var(--accent-primary)', color: 'white', padding: '0.75rem 2rem',
                    borderRadius: '8px', textDecoration: 'none', fontWeight: '700', display: 'inline-flex',
                    alignItems: 'center', gap: '0.5rem' }}>
                  Leggi articolo completo <ExternalLink size={16} />
                </a>
              </div>
            </div>
          ) : (
            <div className="article-html">
              {article.image && showHeroImage && (
                <img src={article.image} alt={article.title} referrerPolicy="no-referrer"
                  style={{ width: '100%', maxHeight: '450px', objectFit: 'cover', borderRadius: '8px', marginBottom: '1.5rem' }}
                />
              )}
              <div dangerouslySetInnerHTML={{ __html: content }}></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ArticleCard = ({ article, onClick, isBookmarked, onBookmarkToggle }) => {
  const [copied, setCopied] = useState(false);

  const shareArticle = async (e) => {
    e.stopPropagation();
    if (navigator.share) {
      await navigator.share({ title: article.title, url: article.link });
    } else {
      await navigator.clipboard.writeText(article.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div onClick={() => onClick(article)} className="article-card glass-panel" style={{ cursor: 'pointer' }}>
      {article.image && (
        <img
          src={article.image.includes('ytimg.com') ? article.image : `/api/img?url=${encodeURIComponent(article.image)}`}
          alt={article.title}
          className="article-image"
          loading="lazy"
          onError={e => { e.target.style.display = 'none'; }}
        />
      )}
      <div className="article-content">
        <div className="article-meta">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="source-badge">{article.sourceName}</span>
            <span>{formatDistanceToNow(article.pubDate, { addSuffix: true, locale: it })}</span>
          </div>
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <button
              className="bookmark-btn"
              onClick={shareArticle}
              title={copied ? 'Link copiato!' : 'Condividi'}
              style={{ opacity: copied ? 1 : 0.7 }}
            >
              {copied ? '✓' : <Share2 size={16} />}
            </button>
            <button
              className={`bookmark-btn ${isBookmarked ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); onBookmarkToggle(article); }}
              title="Salva nei Segnalibri"
            >
              <Star size={18} fill={isBookmarked ? 'currentColor' : 'none'} />
            </button>
          </div>
        </div>

        {article.categories && article.categories.length > 0 && (
          <div className="article-tags">
            {article.categories.map((tag, idx) => (
              <span key={idx} className="tag-badge">{tag}</span>
            ))}
          </div>
        )}

        <h2 className="article-title">{article.title}</h2>
        <p className="article-snippet">{article.snippet}</p>
        <div className="read-more">
          Leggi nel sito <ExternalLink size={14} />
        </div>
      </div>
    </div>
  );
};

const CountBadge = ({ count }) => count > 0 ? (
  <span style={{ marginLeft: 'auto', background: 'var(--accent-primary)', color: 'white', borderRadius: '999px', padding: '0.1rem 0.5rem', fontSize: '0.7rem', fontWeight: '700', minWidth: '1.4rem', textAlign: 'center' }}>{count}</span>
) : null;

function App() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFeed, setActiveFeed] = useState('all');
  const [activeTag, setActiveTag] = useState(null);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [showBackToTop, setShowBackToTop] = useState(false);

  const [bookmarks, setBookmarks] = useState(() => {
    const saved = localStorage.getItem('geopolitica_bookmarks');
    return saved ? JSON.parse(saved) : [];
  });

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('geopolitica_theme') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('geopolitica_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  // Back to top scroll detection (window-level scroll)
  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 400);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const toggleBookmark = (article) => {
    setBookmarks(prev => {
      const isSaved = prev.find(b => b.id === article.id);
      const newBookmarks = isSaved ? prev.filter(b => b.id !== article.id) : [article, ...prev];
      localStorage.setItem('geopolitica_bookmarks', JSON.stringify(newBookmarks));
      return newBookmarks;
    });
  };

  const loadFeeds = async () => {
    setLoading(true);
    let allArticles = [];
    const results = await Promise.all(FEEDS.map(feed => fetchFeed(feed)));
    results.forEach(result => { allArticles = [...allArticles, ...result]; });
    allArticles.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
    setArticles(allArticles);
    setLastUpdated(new Date());
    setLoading(false);
  };

  useEffect(() => {
    loadFeeds();
    const intervalId = setInterval(loadFeeds, 5 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, []);

  const isBookmarked = (id) => bookmarks.some(b => b.id === id);

  // Article counts per source
  const articleCounts = useMemo(() => {
    const counts = {};
    articles.forEach(a => { counts[a.sourceId] = (counts[a.sourceId] || 0) + 1; });
    return counts;
  }, [articles]);

  const popularTags = useMemo(() => {
    const counts = {};
    articles.forEach(a => {
      if (a.categories) a.categories.forEach(tag => { counts[tag] = (counts[tag] || 0) + 1; });
    });
    return Object.entries(counts).filter(([_, count]) => count > 1).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([tag]) => tag);
  }, [articles]);

  const baseArticles = activeFeed === 'bookmarks' ? bookmarks : articles;

  let filteredArticles = activeFeed !== 'all' && activeFeed !== 'bookmarks'
    ? baseArticles.filter(a => a.sourceId === activeFeed)
    : baseArticles;

  if (activeTag) filteredArticles = filteredArticles.filter(a => a.categories && a.categories.includes(activeTag));

  // Search filter
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filteredArticles = filteredArticles.filter(a =>
      a.title.toLowerCase().includes(q) || (a.snippet && a.snippet.toLowerCase().includes(q))
    );
  }

  const youtubeFeedIds = FEEDS.filter(f => f.url.includes('youtube.com')).map(f => f.id);
  const youtubeArticles = filteredArticles.filter(a => youtubeFeedIds.includes(a.sourceId));
  const regularArticles = filteredArticles.filter(a => !youtubeFeedIds.includes(a.sourceId));

  const selectFeed = (id) => {
    setActiveFeed(id);
    setActiveTag(null);
    setSearchQuery('');
    setSidebarOpen(false);
  };



  return (
    <div className="app-container">
      <button className="hamburger-btn" onClick={() => setSidebarOpen(o => !o)} aria-label="Menu">
        <Menu size={22} />
      </button>

      <div className={`sidebar-overlay ${sidebarOpen ? 'visible' : ''}`} onClick={() => setSidebarOpen(false)} />

      <aside className={`sidebar glass-panel ${sidebarOpen ? 'mobile-open' : 'mobile-closed'}`} style={{ borderRadius: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="text-gradient">Geopolitica Rossa</h1>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', fontSize: '0.9rem' }}>
              Aggregatore antimperialista e radicale.
            </p>
          </div>
          <button className="theme-toggle-btn" onClick={toggleTheme} title="Cambia Tema">
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
          <button className={activeFeed === 'all' ? 'active' : ''} onClick={() => selectFeed('all')}>
            <Radio size={18} /> Tutte le Notizie
            <CountBadge count={articles.length} />
          </button>

          <button className={activeFeed === 'bookmarks' ? 'active' : ''} onClick={() => selectFeed('bookmarks')}>
            <Bookmark size={18} /> I Miei Salvataggi
            {bookmarks.length > 0 && <CountBadge count={bookmarks.length} />}
          </button>

          <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', margin: '1rem 0 0.2rem 0' }}>Giornali e Testate</h3>
          {FEEDS.filter(f => f.type === 'giornale').map(feed => (
            <button key={feed.id} className={activeFeed === feed.id ? 'active' : ''} onClick={() => selectFeed(feed.id)}>
              {feed.name} <CountBadge count={articleCounts[feed.id] || 0} />
            </button>
          ))}

          <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', margin: '1rem 0 0.2rem 0' }}>Riviste e Analisi</h3>
          {FEEDS.filter(f => f.type === 'analisi').map(feed => (
            <button key={feed.id} className={activeFeed === feed.id ? 'active' : ''} onClick={() => selectFeed(feed.id)}>
              {feed.name} <CountBadge count={articleCounts[feed.id] || 0} />
            </button>
          ))}

          <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', margin: '1rem 0 0.2rem 0' }}>Canali YouTube</h3>
          {FEEDS.filter(f => f.type === 'video').map(feed => (
            <button key={feed.id} className={activeFeed === feed.id ? 'active' : ''} onClick={() => selectFeed(feed.id)}>
              {feed.name} <CountBadge count={articleCounts[feed.id] || 0} />
            </button>
          ))}

          <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', margin: '1rem 0 0.2rem 0' }}>Partiti e Organizzazioni</h3>
          {FEEDS.filter(f => f.type === 'partito').map(feed => (
            <button key={feed.id} className={activeFeed === feed.id ? 'active' : ''} onClick={() => selectFeed(feed.id)}>
              {feed.name} <CountBadge count={articleCounts[feed.id] || 0} />
            </button>
          ))}
        </div>

        <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
          <button onClick={loadFeeds} disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
            <RefreshCw size={18} className={loading ? 'spinning' : ''} />
            {loading ? 'Aggiornamento...' : 'Aggiorna Feed'}
          </button>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Ultimo aggiornamento: {lastUpdated.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
      </aside>

      <main className="main-content">
        {loading && articles.length === 0 ? (
          <div className="loading-container">
            <div className="loader"></div>
            <p>Sincronizzazione dei feed rivoluzionari in corso...</p>
          </div>
        ) : (
          <div className="content-wrapper">
            {/* Search bar */}
            <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
              <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder="Cerca tra gli articoli..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%', padding: '0.75rem 1rem 0.75rem 2.75rem',
                  background: 'var(--tag-bg)', border: '1px solid var(--border-glass)',
                  borderRadius: '12px', color: 'var(--text-primary)', fontSize: '0.95rem',
                  outline: 'none', boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = 'var(--accent-primary)'}
                onBlur={e => e.target.style.borderColor = 'var(--border-glass)'}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')}
                  style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.25rem' }}>
                  <X size={16} />
                </button>
              )}
            </div>

            {searchQuery && (
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                {filteredArticles.length} risultati per "<strong>{searchQuery}</strong>"
              </p>
            )}

            {popularTags.length > 0 && activeFeed !== 'bookmarks' && !searchQuery && (
              <div className="popular-tags-bar">
                <button className={`tag-filter-btn ${activeTag === null ? 'active' : ''}`} onClick={() => setActiveTag(null)}>
                  Tutti i Tag
                </button>
                {popularTags.map(tag => (
                  <button key={tag} className={`tag-filter-btn ${activeTag === tag ? 'active' : ''}`} onClick={() => setActiveTag(tag)}>
                    #{tag}
                  </button>
                ))}
              </div>
            )}

            {regularArticles.length > 0 && (
              <section className="feed-section">
                <h2 style={{ marginBottom: '1.5rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.5rem' }}>
                  {activeFeed === 'bookmarks' ? 'Articoli Salvati' : 'Articoli e Analisi'}
                  <span style={{ marginLeft: '0.75rem', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 400 }}>({regularArticles.length})</span>
                </h2>
                <div className="articles-grid">
                  {regularArticles.map(article => (
                    <ArticleCard key={article.id} article={article} onClick={setSelectedArticle}
                      isBookmarked={isBookmarked(article.id)} onBookmarkToggle={toggleBookmark} />
                  ))}
                </div>
              </section>
            )}

            {youtubeArticles.length > 0 && (
              <section className="feed-section" style={{ marginTop: '3rem' }}>
                <h2 style={{ marginBottom: '1.5rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.5rem' }}>
                  {activeFeed === 'bookmarks' ? 'Video Salvati' : 'Video da YouTube'}
                  <span style={{ marginLeft: '0.75rem', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 400 }}>({youtubeArticles.length})</span>
                </h2>
                <div className="articles-grid">
                  {youtubeArticles.map(article => (
                    <ArticleCard key={article.id} article={article} onClick={setSelectedArticle}
                      isBookmarked={isBookmarked(article.id)} onBookmarkToggle={toggleBookmark} />
                  ))}
                </div>
              </section>
            )}

            {filteredArticles.length === 0 && !loading && (
              <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-secondary)' }}>
                <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</p>
                <p style={{ fontSize: '1.1rem' }}>Nessun articolo trovato{searchQuery ? ` per "${searchQuery}"` : ''}.</p>
              </div>
            )}
          </div>
        )}

        {/* Back to top button */}
        {showBackToTop && (
          <button onClick={scrollToTop}
            style={{
              position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 100,
              background: 'var(--accent-primary)', color: 'white',
              border: 'none', borderRadius: '50%', width: '48px', height: '48px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
              transition: 'transform 0.2s, opacity 0.2s',
            }}
            title="Torna in cima"
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            <ChevronUp size={24} />
          </button>
        )}
      </main>

      {selectedArticle && (
        <ReaderModal article={selectedArticle} onClose={() => setSelectedArticle(null)} />
      )}
    </div>
  );
}

export default App;
