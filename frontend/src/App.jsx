import React, { useState, useEffect } from 'react';
import { 
  LogOut, ExternalLink, RefreshCw, 
  ShoppingBag, Link as LinkIcon, Loader2,
  Share2, Trash2, Eye, X, Plus, Search, Tag
} from 'lucide-react';
import axios from 'axios';

const API_URL = '/api';

const App = () => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [view, setView] = useState('loading');
  const [snipImage, setSnipImage] = useState(null); 

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (token && storedUser) {
      setUser(JSON.parse(storedUser));
      setView('dashboard');
    } else {
      setView('login');
    }
  }, [token]);

  const handleLogin = (token, userData) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setToken(token);
    setUser(userData);
    setView('dashboard');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    setView('login');
  };

  if (view === 'loading') return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#0f172a]">
      <Loader2 className="animate-spin text-indigo-500" size={48} />
      <p className="text-slate-500 text-sm tracking-widest uppercase">Initializing LootLook</p>
    </div>
  );

  return (
    <div className="min-h-screen font-sans selection:bg-indigo-500/30 relative pb-20">
      {view === 'login' && <AuthForm type="login" onAuth={handleLogin} onSwitch={() => setView('register')} />}
      {view === 'register' && <AuthForm type="register" onAuth={handleLogin} onSwitch={() => setView('login')} />}
      {view === 'dashboard' && user && (
        <Dashboard 
          user={user} 
          token={token} 
          onLogout={handleLogout} 
          openSnip={(img) => setSnipImage(img)}
        />
      )}

      {/* Full Screen Image Modal */}
      {snipImage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200" onClick={() => setSnipImage(null)}>
          <div className="relative max-w-6xl w-full max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
            <div className="absolute -top-12 right-0 z-10">
              <button onClick={() => setSnipImage(null)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition backdrop-blur-md border border-white/10">
                <X size={24} />
              </button>
            </div>
            <img src={snipImage} alt="Snip" className="w-auto h-full max-h-[85vh] object-contain rounded-lg shadow-2xl border border-white/10" />
          </div>
        </div>
      )}
    </div>
  );
};

// --- AUTH SCREEN ---
const AuthForm = ({ type, onAuth, onSwitch }) => {
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const endpoint = type === 'login' ? '/auth/login' : '/auth/register';
      const res = await axios.post(`${API_URL}${endpoint}`, formData);
      if (type === 'register') {
        const loginRes = await axios.post(`${API_URL}/auth/login`, formData);
        onAuth(loginRes.data.token, { id: loginRes.data.id, username: loginRes.data.username });
      } else {
        onAuth(res.data.token, { id: res.data.id, username: res.data.username });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Authentication failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-6 relative overflow-hidden">
      {/* Background Blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="glass-panel p-8 md:p-12 rounded-3xl w-full max-w-md relative z-10 shadow-2xl">
        <div className="flex justify-center mb-6">
          <div className="bg-indigo-500/20 p-4 rounded-2xl">
            <ShoppingBag size={40} className="text-indigo-400" />
          </div>
        </div>
        
        <h1 className="text-3xl font-bold mb-2 text-center text-white tracking-tight">
          {type === 'login' ? 'Welcome Back' : 'Join the Hunt'}
        </h1>
        <p className="text-center text-slate-400 mb-8 text-sm">
          {type === 'login' ? 'Sign in to access your collection.' : 'Start tracking prices like a pro.'}
        </p>
        
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Username</label>
            <input 
              type="text" 
              className="w-full p-4 rounded-xl input-premium"
              placeholder="Enter your username"
              value={formData.username} 
              onChange={e => setFormData({...formData, username: e.target.value})} 
              required 
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Password</label>
            <input 
              type="password" 
              className="w-full p-4 rounded-xl input-premium"
              placeholder="••••••••"
              value={formData.password} 
              onChange={e => setFormData({...formData, password: e.target.value})} 
              required 
            />
          </div>
          
          {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-center font-medium">{error}</div>}

          <button type="submit" disabled={loading} className="w-full p-4 rounded-xl btn-primary font-bold shadow-lg mt-2 disabled:opacity-70 flex justify-center items-center gap-2 transition-all">
            {loading ? <Loader2 className="animate-spin" size={20} /> : (type === 'login' ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <div className="mt-8 text-center pt-6 border-t border-white/5">
          <button className="text-slate-400 text-sm hover:text-white transition-colors font-medium" onClick={onSwitch}>
            {type === 'login' ? "Don't have an account? Sign up" : "Already have an account? Log in"}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- DASHBOARD ---
const Dashboard = ({ user, token, onLogout, openSnip }) => {
  const [bookmarks, setBookmarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newUrl, setNewUrl] = useState('');

  const fetchBookmarks = async () => {
    try {
      const res = await axios.get(`${API_URL}/bookmarks`, { headers: { Authorization: `Bearer ${token}` } });
      setBookmarks(res.data);
    } catch (err) { console.error("Failed to fetch", err); } 
    finally { setLoading(false); }
  };

  useEffect(() => { fetchBookmarks(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newUrl) return;
    setAdding(true);
    try {
      await axios.post(`${API_URL}/bookmarks`, { url: newUrl }, { headers: { Authorization: `Bearer ${token}` } });
      setNewUrl('');
      fetchBookmarks();
    } catch (err) { alert('Failed to add link'); } 
    finally { setAdding(false); }
  };

  const handleCheck = async (id) => {
    try {
      await axios.post(`${API_URL}/bookmarks/${id}/check`, {}, { headers: { Authorization: `Bearer ${token}` } });
      fetchBookmarks();
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this?")) return;
    try {
      await axios.delete(`${API_URL}/bookmarks/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      setBookmarks(bookmarks.filter(b => b.id !== id));
    } catch (err) { alert("Failed to delete"); }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      
      {/* Navbar */}
      <nav className="flex flex-col md:flex-row justify-between items-center mb-12 gap-6 glass-panel p-4 md:p-6 rounded-2xl md:rounded-full">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="bg-indigo-600/90 p-2.5 rounded-full shadow-lg shadow-indigo-600/30">
            <ShoppingBag size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white leading-none">LootLook</h1>
            <p className="text-xs text-indigo-300 font-medium">@{user.username}</p>
          </div>
        </div>

        {/* Add Bar (Centered on Desktop) */}
        <form onSubmit={handleAdd} className="relative group w-full md:w-[500px]">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-400 transition-colors">
            {adding ? <Loader2 className="animate-spin" size={18} /> : <LinkIcon size={18} />}
          </div>
          <input 
            type="url" 
            placeholder="Paste product link..." 
            className="w-full pl-12 pr-28 py-3 rounded-xl bg-slate-900/50 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-sm"
            value={newUrl} 
            onChange={(e) => setNewUrl(e.target.value)} 
            required 
            disabled={adding}
          />
          <button 
            type="submit" 
            disabled={adding} 
            className="absolute right-1.5 top-1.5 bottom-1.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md disabled:opacity-50 transition-colors"
          >
            {adding ? '...' : 'Add Link'}
          </button>
        </form>

        <div className="w-full md:w-auto flex justify-end">
          <button onClick={onLogout} className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors px-4 py-2 hover:bg-white/5 rounded-full">
            <LogOut size={16} />
            <span>Log Out</span>
          </button>
        </div>
      </nav>

      {/* Grid Content */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-80 rounded-2xl bg-white/5 animate-pulse border border-white/5"></div>
          ))}
        </div>
      ) : (
        <>
          {bookmarks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-center border-2 border-dashed border-white/5 rounded-3xl bg-white/5">
              <div className="w-20 h-20 bg-indigo-500/10 rounded-full flex items-center justify-center mb-6 text-indigo-400">
                <Plus size={40} />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Your collection is empty</h3>
              <p className="text-slate-400 max-w-md">Paste a URL in the bar above to add your first item.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {bookmarks.map(bm => (
                <BookmarkCard 
                  key={bm.id} 
                  data={bm} 
                  onCheck={() => handleCheck(bm.id)} 
                  onDelete={() => handleDelete(bm.id)} 
                  onSnip={() => openSnip(bm.image_url)} 
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// --- CARD COMPONENT ---
const BookmarkCard = ({ data, onCheck, onDelete, onSnip }) => {
  const isProduct = data.is_tracked;
  const formatPrice = (p) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: data.currency || 'INR', maximumFractionDigits: 0 }).format(p);

  const handleShare = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: data.title, url: data.url }); } catch (err) {}
    } else {
      navigator.clipboard.writeText(data.url);
      alert("Copied!");
    }
  };

  return (
    <div className="glass-card rounded-2xl flex flex-col h-full group">
      {/* Image Header */}
      <div className="h-48 relative overflow-hidden bg-slate-900/50 cursor-pointer" onClick={onSnip}>
        {data.image_url ? (
          <img 
            src={data.image_url} 
            alt={data.title} 
            className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-110 transition duration-700 ease-out" 
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }} 
          />
        ) : null}
        
        {/* Fallback if image fails */}
        <div className="hidden absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
          <ShoppingBag size={32} className="text-slate-700" />
        </div>

        {/* Badges */}
        <div className="absolute top-3 left-3 right-3 flex justify-between items-start">
          <div className="flex gap-2">
            {isProduct ? (
              <span className="bg-emerald-500/20 backdrop-blur-md border border-emerald-500/20 text-emerald-300 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md shadow-sm">
                Tracking
              </span>
            ) : (
              <span className="bg-slate-500/20 backdrop-blur-md border border-slate-500/20 text-slate-300 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md shadow-sm">
                Bookmark
              </span>
            )}
          </div>
        </div>

        {/* Hover Overlay */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
          <div className="bg-white/10 p-3 rounded-full border border-white/20 transform scale-75 group-hover:scale-100 transition-transform">
            <Eye className="text-white" size={24} />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col flex-grow">
        {/* Title */}
        <h3 className="text-sm font-medium text-slate-200 line-clamp-2 leading-relaxed h-10 mb-4" title={data.title}>
          {data.title}
        </h3>
        
        {/* Price/Type Section */}
        <div className="mt-auto mb-5">
          {isProduct ? (
            <div>
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-0.5">Current Price</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white tracking-tight">{formatPrice(data.current_price)}</span>
                <span className="text-xs text-emerald-400 font-medium">Live</span>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-0.5">Type</p>
              <span className="text-base font-medium text-slate-300">Web Link</span>
            </div>
          )}
        </div>

        {/* Action Bar */}
        <div className="pt-4 border-t border-white/5 flex items-center justify-between gap-2">
          <div className="flex gap-1">
            <button onClick={(e) => { e.stopPropagation(); onCheck(); }} className="btn-icon p-2 rounded-lg" title="Refresh"><RefreshCw size={14} /></button>
            <button onClick={(e) => { e.stopPropagation(); handleShare(); }} className="btn-icon p-2 rounded-lg" title="Share"><Share2 size={14} /></button>
            <a href={data.url} target="_blank" rel="noreferrer" className="btn-icon p-2 rounded-lg flex items-center justify-center" title="Open"><ExternalLink size={14} /></a>
          </div>
          
          <button 
            onClick={(e) => { e.stopPropagation(); onDelete(); }} 
            className="p-2 rounded-lg text-red-900/50 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
        
        <div className="mt-3 flex justify-between items-center text-[10px] text-slate-600 font-medium">
           <span>Updated {new Date(data.last_checked).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
};

export default App;