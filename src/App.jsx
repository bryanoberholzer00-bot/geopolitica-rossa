import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Radio, ExternalLink, X, Star, Bookmark, Sun, Moon, Menu } from 'lucide-react';
import { FEEDS, fetchFeed } from './FeedService';
import { formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';

const ReaderModal = ({ article, onClose }) => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [showHeroImage, setShowHeroImage] = useState(false); // only for Readability content
  const bodyRef = React.useRef(null);

  // After content renders, fix all images inside the modal
  useEffect(() => {
    if (!bodyRef.current || loading) return;
    const baseUrl = article.link ? new URL(article.link).origin : '';
    bodyRef.current.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src') || '';
      const alt = (img.getAttribute('alt') || '').toLowerCase();
      const dataSrc = img.getAttribute('data-src') || img.getAttribute('data-lazy-src');

      // Skip tiny avatar/author images
      const w = parseInt(img.getAttribute('width') || '999');
      const h = parseInt(img.getAttribute('height') || '999');
      const isAvatar = w <= 150 || h <= 150 
        || src.includes('avatar') || src.includes('f100x') || src.includes('author')
        || alt.includes('redazione') || alt.includes('autore') || alt.includes('author');
      if (isAvatar) {
        img.style.display = 'none';
        return;
      }

      // Fix referrer
      img.setAttribute('referrerpolicy', 'no-referrer');
      img.removeAttribute('loading');
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.style.borderRadius = '8px';
      img.style.margin = '1rem 0';

      // Fix relative URLs
      if (src && src.startsWith('/') && baseUrl) {
        img.setAttribute('src', baseUrl + src);
      }
      // Handle data-src lazy loading
      if (dataSrc) img.setAttribute('src', dataSrc);

      // Hide if broken
      img.onerror = () => { img.style.display = 'none'; };
    });

    // Deduplicate images by filename stem — keeps first occurrence, removes duplicates.
    // Handles same image served from different CDN domains or with different size suffixes.
    const seenStems = new Set();
    bodyRef.current.querySelectorAll('img').forEach(img => {
      if (img.style.display === 'none') return;
      const src = img.getAttribute('src') || '';
      const stem = src
        .replace(/[-_](scaled|\d+x\d+)(\.[^.?#]+)?(\?.*)?$/, '') // strip size suffix
        .split('/').pop()
        .replace(/\.[^.]+$/, ''); // strip extension
      if (!stem) return;
      if (seenStems.has(stem)) {
        img.remove();
      } else {
        seenStems.add(stem);
      }
    });
  }, [content, loading]);

  useEffect(() => {
    const loadContent = async () => {
      setLoading(true);
      setError(null);
      setUsedFallback(false);

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
        } else {
          setUsedFallback(true);
        }
        setLoading(false);
        return;
      }


      // 1. Best case: full content already in the RSS feed (e.g. Marx21, WordPress sites)
      if (article.fullContent && article.fullContent.trim().length > 100) {
        // Sanitize: remove WordPress nav buttons, fix links
        const tmp = document.createElement('div');
        tmp.innerHTML = article.fullContent;

        // Remove WordPress "Leggi tutto" buttons and nav links
        tmp.querySelectorAll('a.btn, a.more-link, a[href*="?p="], .wp-block-buttons, .navigation, .nav-links, .sharedaddy, .sd-social').forEach(el => el.remove());

        // Make all remaining links open in new tab
        tmp.querySelectorAll('a').forEach(a => {
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener noreferrer');
        });

        // Remove images from fullContent that duplicate article.image (shown as hero above)
        if (article.image) {
          const heroStem = article.image
            .replace(/[-_](scaled|\d+x\d+)(\.[^.?#]+)?(\?.*)?$/, '')
            .split('/').pop()
            .replace(/\.[^.]+$/, '');
          tmp.querySelectorAll('img').forEach(img => {
            const src = img.getAttribute('src') || '';
            const stem = src
              .replace(/[-_](scaled|\d+x\d+)(\.[^.?#]+)?(\?.*)?$/, '')
              .split('/').pop()
              .replace(/\.[^.]+$/, '');
            if (stem && stem === heroStem) img.remove();
          });
        }

        // Fix remaining images
        tmp.querySelectorAll('img').forEach(img => {
          img.setAttribute('referrerpolicy', 'no-referrer');
          img.style.maxWidth = '100%';
          img.style.height = 'auto';
        });

        setShowHeroImage(true); // always show hero image for RSS full content
        setContent(tmp.innerHTML);
        setLoading(false);
        return;
      }

      // 2. Fallback: fetch via proxy reader
      try {
        const res = await fetch(`${import.meta.env.PROD ? '' : 'http://127.0.0.1:3001'}/api/read?url=${encodeURIComponent(article.link)}`);
        if (!res.ok) throw new Error('blocked');
        const data = await res.json();
        // Sanitize Readability content too
        const tmp = document.createElement('div');
        tmp.innerHTML = data.content;
        tmp.querySelectorAll('a').forEach(a => {
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener noreferrer');
        });
        setShowHeroImage(true); // show hero image for Readability content
        setContent(tmp.innerHTML);
      } catch (err) {
        // 3. Last resort: show snippet + link to original
        setUsedFallback(true);
      }
      setLoading(false);
    };

    loadContent();
  }, [article]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content glass-panel" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}><X size={24} /></button>
        <div className="modal-header">
          <span className="source-badge">{article.sourceName}</span>
          <h2>{article.title}</h2>
          <a href={article.link} target="_blank" rel="noopener noreferrer" className="original-link">
            Vedi originale <ExternalLink size={14} />
          </a>
        </div>
        
        <div className="modal-body" ref={bodyRef}>
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
                <img 
                  src={article.image} 
                  alt={article.title} 
                  referrerPolicy="no-referrer"
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



const ArticleCard = ({ article, onClick, isBookmarked, onBookmarkToggle }) => (
  <div onClick={() => onClick(article)} className="article-card glass-panel" style={{cursor: 'pointer'}}>
    {article.image && (
      <img src={article.image} alt={article.title} className="article-image" loading="lazy" referrerPolicy="no-referrer" />
    )}
    <div className="article-content">
      <div className="article-meta">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="source-badge">{article.sourceName}</span>
          <span>{formatDistanceToNow(article.pubDate, { addSuffix: true, locale: it })}</span>
        </div>
        <button 
          className={`bookmark-btn ${isBookmarked ? 'active' : ''}`}
          onClick={(e) => { e.stopPropagation(); onBookmarkToggle(article); }}
          title="Salva nei Segnalibri"
        >
          <Star size={18} fill={isBookmarked ? 'currentColor' : 'none'} />
        </button>
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

function App() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFeed, setActiveFeed] = useState('all'); // 'all', 'bookmarks', or sourceId
  const [activeTag, setActiveTag] = useState(null);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // Segnalibri State
  const [bookmarks, setBookmarks] = useState(() => {
    const saved = localStorage.getItem('geopolitica_bookmarks');
    return saved ? JSON.parse(saved) : [];
  });

  // Sidebar mobile state
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Tema State
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('geopolitica_theme') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('geopolitica_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  const toggleBookmark = (article) => {
    setBookmarks(prev => {
      const isSaved = prev.find(b => b.id === article.id);
      let newBookmarks;
      if (isSaved) {
        newBookmarks = prev.filter(b => b.id !== article.id);
      } else {
        newBookmarks = [article, ...prev];
      }
      localStorage.setItem('geopolitica_bookmarks', JSON.stringify(newBookmarks));
      return newBookmarks;
    });
  };

  const loadFeeds = async () => {
    setLoading(true);
    let allArticles = [];
    
    // Fetch all feeds in parallel
    const promises = FEEDS.map(feed => fetchFeed(feed));
    const results = await Promise.all(promises);
    
    results.forEach(result => {
      allArticles = [...allArticles, ...result];
    });

    // Sort by newest first
    allArticles.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
    
    setArticles(allArticles);
    setLastUpdated(new Date());
    setLoading(false);
  };

  useEffect(() => {
    loadFeeds();
    
    // Auto-aggiornamento ogni 5 minuti in background
    const intervalId = setInterval(() => {
      loadFeeds();
    }, 5 * 60 * 1000); // 300000 ms
    
    return () => clearInterval(intervalId);
  }, []);

  const isBookmarked = (id) => bookmarks.some(b => b.id === id);

  // Calcola i Tag più popolari
  const popularTags = useMemo(() => {
    const counts = {};
    articles.forEach(a => {
      if (a.categories) {
        a.categories.forEach(tag => {
          counts[tag] = (counts[tag] || 0) + 1;
        });
      }
    });
    return Object.entries(counts)
      .filter(([_, count]) => count > 1) // Solo tag usati in più di 1 articolo
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15) // Prendi i top 15
      .map(([tag]) => tag);
  }, [articles]);

  const baseArticles = activeFeed === 'bookmarks' ? bookmarks : articles;
  
  let filteredArticles = activeFeed !== 'all' && activeFeed !== 'bookmarks' 
    ? baseArticles.filter(a => a.sourceId === activeFeed)
    : baseArticles;

  if (activeTag) {
    filteredArticles = filteredArticles.filter(a => a.categories && a.categories.includes(activeTag));
  }

  const youtubeFeedIds = FEEDS.filter(f => f.url.includes('youtube.com')).map(f => f.id);
  const youtubeArticles = filteredArticles.filter(a => youtubeFeedIds.includes(a.sourceId));
  const regularArticles = filteredArticles.filter(a => !youtubeFeedIds.includes(a.sourceId));

  const selectFeed = (id) => {
    setActiveFeed(id);
    setActiveTag(null);
    setSidebarOpen(false); // close drawer on mobile
  };

  return (
    <div className="app-container">
      {/* Hamburger button — mobile only */}
      <button className="hamburger-btn" onClick={() => setSidebarOpen(o => !o)} aria-label="Menu">
        <Menu size={22} />
      </button>

      {/* Dark overlay behind open sidebar */}
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
          <button 
            className={activeFeed === 'all' ? 'active' : ''} 
            onClick={() => selectFeed('all')}
          >
            <Radio size={18} />
            Tutte le Notizie
          </button>
          
          <button 
            className={activeFeed === 'bookmarks' ? 'active' : ''} 
            onClick={() => selectFeed('bookmarks')}
          >
            <Bookmark size={18} />
            I Miei Salvataggi
          </button>
          
          <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', margin: '1rem 0 0.2rem 0' }}>Giornali e Testate</h3>
          {FEEDS.filter(f => f.type === 'giornale').map(feed => (
            <button 
              key={feed.id}
              className={activeFeed === feed.id ? 'active' : ''}
              onClick={() => selectFeed(feed.id)}
            >
              {feed.name}
            </button>
          ))}

          <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', margin: '1rem 0 0.2rem 0' }}>Riviste e Analisi</h3>
          {FEEDS.filter(f => f.type === 'analisi').map(feed => (
            <button 
              key={feed.id}
              className={activeFeed === feed.id ? 'active' : ''}
              onClick={() => selectFeed(feed.id)}
            >
              {feed.name}
            </button>
          ))}

          <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', margin: '1rem 0 0.2rem 0' }}>Canali YouTube</h3>
          {FEEDS.filter(f => f.type === 'video').map(feed => (
            <button 
              key={feed.id}
              className={activeFeed === feed.id ? 'active' : ''}
              onClick={() => selectFeed(feed.id)}
            >
              {feed.name}
            </button>
          ))}

          <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', margin: '1rem 0 0.2rem 0' }}>Partiti e Organizzazioni</h3>
          {FEEDS.filter(f => f.type === 'partito').map(feed => (
            <button 
              key={feed.id}
              className={activeFeed === feed.id ? 'active' : ''}
              onClick={() => selectFeed(feed.id)}
            >
              {feed.name}
            </button>
          ))}
        </div>

        <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
          <button 
            onClick={loadFeeds} 
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center' }}
          >
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
            {popularTags.length > 0 && activeFeed !== 'bookmarks' && (
              <div className="popular-tags-bar">
                <button 
                  className={`tag-filter-btn ${activeTag === null ? 'active' : ''}`}
                  onClick={() => setActiveTag(null)}
                >
                  Tutti i Tag
                </button>
                {popularTags.map(tag => (
                  <button 
                    key={tag}
                    className={`tag-filter-btn ${activeTag === tag ? 'active' : ''}`}
                    onClick={() => setActiveTag(tag)}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}

            {regularArticles.length > 0 && (
              <section className="feed-section">
                <h2 style={{ marginBottom: '1.5rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                  {activeFeed === 'bookmarks' ? 'Articoli Salvati' : 'Articoli e Analisi'}
                </h2>
                <div className="articles-grid">
                  {regularArticles.map(article => (
                    <ArticleCard 
                      key={article.id} 
                      article={article} 
                      onClick={setSelectedArticle}
                      isBookmarked={isBookmarked(article.id)}
                      onBookmarkToggle={toggleBookmark}
                    />
                  ))}
                </div>
              </section>
            )}

            {youtubeArticles.length > 0 && (
              <section className="feed-section" style={{ marginTop: '3rem' }}>
                <h2 style={{ marginBottom: '1.5rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                  {activeFeed === 'bookmarks' ? 'Video Salvati' : 'Video da YouTube'}
                </h2>
                <div className="articles-grid">
                  {youtubeArticles.map(article => (
                    <ArticleCard 
                      key={article.id} 
                      article={article} 
                      onClick={setSelectedArticle}
                      isBookmarked={isBookmarked(article.id)}
                      onBookmarkToggle={toggleBookmark}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
      
      {selectedArticle && (
        <ReaderModal 
          article={selectedArticle} 
          onClose={() => setSelectedArticle(null)} 
        />
      )}
    </div>
  );
}

export default App;
