import React, { useState, useEffect } from 'react';
import { 
  LogOut, ExternalLink, RefreshCw, 
  ShoppingBag, Search, Plus, Loader2, Link as LinkIcon
} from 'lucide-react';
import axios from 'axios';

const API_URL = '/api';

const App = () => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [view, setView] = useState('loading'); // loading, login, register, dashboard

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

  if (view === 'loading') return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-indigo-500" size={40} /></div>;

  return (
    <div className="min-h-screen text-slate-200 font-sans selection:bg-indigo-500/30">
      {view === 'login' && <AuthForm type="login" onAuth={handleLogin} onSwitch={() => setView('register')} />}
      {view === 'register' && <AuthForm type="register" onAuth={handleLogin} onSwitch={() => setView('login')} />}
      {view === 'dashboard' && user && (
        <Dashboard user={user} token={token} onLogout={handleLogout} />
      )}
    </div>
  );
};

// --- AUTH COMPONENT ---
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
    <div className="flex items-center justify-center min-h-screen p-4">
      <div className="glass p-8 md:p-10 rounded-2xl w-full max-w-md relative overflow-hidden">
        {/* Decorative Glow */}
        <div className="absolute -top-20 -left-20 w-40 h-40 bg-indigo-500/30 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-purple-500/30 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10">
          <h1 className="text-4xl font-bold mb-2 text-center bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400 tracking-tight">
            LootLook
          </h1>
          <p className="text-center text-slate-400 mb-8">{type === 'login' ? 'Welcome back, Hunter.' : 'Start your collection.'}</p>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1 ml-1">USERNAME</label>
              <input type="text" className="w-full p-3 rounded-xl input-field outline-none"
                value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1 ml-1">PASSWORD</label>
              <input type="password" className="w-full p-3 rounded-xl input-field outline-none"
                value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} required />
            </div>
            
            {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">{error}</div>}

            <button type="submit" disabled={loading} className="w-full p-3.5 rounded-xl btn-primary font-bold shadow-lg shadow-indigo-500/20 mt-2 disabled:opacity-50 flex justify-center items-center gap-2">
              {loading && <Loader2 className="animate-spin" size={18} />}
              {type === 'login' ? 'Login' : 'Create Account'}
            </button>
          </form>

          <div className="mt-8 text-center">
            <button className="text-slate-400 text-sm hover:text-white transition-colors" onClick={onSwitch}>
              {type === 'login' ? "New here? Create an account" : "Already have an account? Login"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- DASHBOARD COMPONENT ---
const Dashboard = ({ user, token, onLogout }) => {
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
    // Optimistic UI update could go here
    try {
      await axios.post(`${API_URL}/bookmarks/${id}/check`, {}, { headers: { Authorization: `Bearer ${token}` } });
      fetchBookmarks();
    } catch (err) { console.error(err); }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 md:py-10">
      
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-center mb-10 gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-600 p-3 rounded-2xl shadow-lg shadow-indigo-600/20">
            <ShoppingBag size={28} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">LootLook</h1>
            <p className="text-sm text-slate-400">Stash & Track • @{user.username}</p>
          </div>
        </div>
        <button onClick={onLogout} className="px-4 py-2 rounded-xl bg-slate-800/50 hover:bg-slate-700 text-slate-400 hover:text-white transition flex items-center gap-2 text-sm font-medium border border-slate-700/50">
          <LogOut size={16} /> Sign Out
        </button>
      </header>

      {/* Add Bar - Centered and Wide */}
      <div className="mb-12 max-w-3xl mx-auto relative z-10">
        <div className="absolute inset-0 bg-indigo-500/10 blur-xl rounded-full"></div>
        <form onSubmit={handleAdd} className="relative group">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-400 transition-colors">
            {adding ? <Loader2 className="animate-spin" size={20} /> : <LinkIcon size={20} />}
          </div>
          <input 
            type="url" 
            placeholder="Paste a link to bookmark (Amazon, Flipkart, or anything)..." 
            className="w-full pl-12 pr-32 py-4 rounded-2xl input-field text-lg outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all shadow-xl"
            value={newUrl} 
            onChange={(e) => setNewUrl(e.target.value)} 
            required 
            disabled={adding}
          />
          <button 
            type="submit" 
            disabled={adding} 
            className="absolute right-2 top-2 bottom-2 px-6 rounded-xl btn-primary font-semibold text-sm shadow-md disabled:opacity-50"
          >
            {adding ? 'Scanning...' : 'Add'}
          </button>
        </form>
      </div>

      {/* Content Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
          <Loader2 className="animate-spin" size={32} />
          <p>Loading your loot...</p>
        </div>
      ) : (
        <>
          {bookmarks.length === 0 ? (
            <div className="text-center py-20 px-4 border border-dashed border-slate-700/50 rounded-3xl bg-slate-800/20">
              <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-600">
                <Plus size={32} />
              </div>
              <h3 className="text-xl font-semibold text-slate-300 mb-2">No bookmarks yet</h3>
              <p className="text-slate-500 max-w-md mx-auto">Paste a link above to get started. If it's a product, we'll start tracking its price automatically.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
              {bookmarks.map(bm => <BookmarkCard key={bm.id} data={bm} onCheck={() => handleCheck(bm.id)} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// --- CARD COMPONENT ---
const BookmarkCard = ({ data, onCheck }) => {
  const isProduct = data.is_tracked;
  const formatPrice = (p) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: data.currency || 'INR', maximumFractionDigits: 0 }).format(p);

  return (
    <div className="glass-card rounded-2xl overflow-hidden flex flex-col h-full group relative">
      {/* Image Container */}
      <div className="h-48 overflow-hidden relative bg-slate-900 border-b border-white/5">
        {data.image_url ? (
          <img 
            src={data.image_url} 
            alt={data.title} 
            className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition duration-700" 
            onError={(e) => e.target.style.display = 'none'} 
          />
        ) : (
          <div className="flex items-center justify-center h-full text-slate-700">
            <ShoppingBag size={48} strokeWidth={1} />
          </div>
        )}
        
        {/* Badges */}
        <div className="absolute top-3 right-3 flex gap-2">
          {isProduct && (
            <span className="bg-emerald-500/90 backdrop-blur text-white text-[10px] uppercase tracking-wider px-2 py-1 rounded-md font-bold shadow-sm">
              Tracking
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-5 flex flex-col flex-grow">
        <h3 className="font-medium text-slate-200 line-clamp-2 mb-3 leading-snug text-sm md:text-base h-10" title={data.title}>
          {data.title}
        </h3>
        
        <div className="mt-auto pt-4 flex items-end justify-between border-t border-white/5">
          <div>
            {isProduct ? (
              <div className="flex flex-col">
                <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">Current Price</span>
                <span className="text-xl font-bold text-emerald-400 tracking-tight">{formatPrice(data.current_price)}</span>
              </div>
            ) : (
              <div className="flex flex-col">
                 <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">Type</span>
                 <span className="text-sm text-slate-400 font-medium">Bookmark</span>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button 
              onClick={(e) => { e.preventDefault(); onCheck(); }} 
              className="p-2 rounded-xl bg-slate-700/50 hover:bg-indigo-600 hover:text-white text-slate-400 transition-colors" 
              title="Check Price Now"
            >
              <RefreshCw size={16} />
            </button>
            <a 
              href={data.url} 
              target="_blank" 
              rel="noreferrer" 
              className="p-2 rounded-xl bg-slate-700/50 hover:bg-indigo-600 hover:text-white text-slate-400 transition-colors"
              title="Visit Link"
            >
              <ExternalLink size={16} />
            </a>
          </div>
        </div>
        
        {/* Timestamp */}
        <div className="mt-3 text-[10px] text-slate-600 flex justify-between items-center">
          <span>{data.site_name || 'Web'}</span>
          <span>Checked: {new Date(data.last_checked).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
};

export default App;