import React, { useState, useEffect } from 'react';
import { 
  LogOut, ExternalLink, RefreshCw, ShoppingBag, Link as LinkIcon, Loader2,
  Share2, Trash2, Eye, X, Plus, Search, Copy, Download, UserMinus, LogOut as LeaveIcon,
  ScanSearch, Filter, Bell, TrendingUp, ClipboardPaste // Added ClipboardPaste icon
} from 'lucide-react';
import axios from 'axios';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const API_URL = '/api';

// Date Formatter: Dynamic (Uses User's Local Device Time)
const formatDate = (dateString) => {
  if (!dateString) return 'Never';
  return new Date(dateString).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: true
  });
};

const App = () => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [view, setView] = useState('loading');
  const [snipImage, setSnipImage] = useState(null);
  const [historyItem, setHistoryItem] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

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

  if (view === 'loading') return <div className="min-h-screen flex items-center justify-center bg-[#0f172a]"><Loader2 className="animate-spin text-indigo-500" size={48} /></div>;

  return (
    <div className="min-h-screen text-slate-200 font-sans selection:bg-indigo-500/30 relative pb-20 overflow-x-hidden">
      {view === 'login' && <AuthForm type="login" onAuth={handleLogin} onSwitch={() => setView('register')} />}
      {view === 'register' && <AuthForm type="register" onAuth={handleLogin} onSwitch={() => setView('login')} />}
      {view === 'dashboard' && user && (
        <Dashboard 
          user={user} 
          token={token} 
          onLogout={handleLogout} 
          openSnip={(img) => setSnipImage(img)}
          openHistory={(item) => setHistoryItem(item)}
          openSettings={() => setShowSettings(true)}
        />
      )}

      {/* Full Screen Snip Viewer */}
      {snipImage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-md p-4 animate-in fade-in" onClick={() => setSnipImage(null)}>
          <div className="relative w-full h-full max-w-lg flex flex-col items-center justify-center">
            <button onClick={() => setSnipImage(null)} className="absolute top-4 right-4 p-3 bg-white/10 rounded-full text-white hover:bg-white/20 transition z-50"><X size={24} /></button>
            <img src={snipImage} alt="Snip" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
          </div>
        </div>
      )}

      {historyItem && <HistoryModal item={historyItem} token={token} onClose={() => setHistoryItem(null)} />}
      {showSettings && <SettingsModal token={token} onClose={() => setShowSettings(false)} />}
    </div>
  );
};

const AuthForm = ({ type, onAuth, onSwitch }) => {
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    } catch (err) { setError(err.response?.data?.error || 'Authentication failed'); } 
    finally { setLoading(false); }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-6 relative overflow-hidden">
      <div className="glass-panel p-8 md:p-12 rounded-3xl w-full max-w-md relative z-10 shadow-2xl">
        <div className="flex justify-center mb-6"><div className="bg-indigo-500/20 p-4 rounded-2xl"><ShoppingBag size={40} className="text-indigo-400" /></div></div>
        <h1 className="text-3xl font-bold mb-2 text-center text-white">{type === 'login' ? 'Welcome Back' : 'Join LootLook'}</h1>
        <form onSubmit={handleSubmit} className="space-y-5 mt-8">
          <input type="text" className="w-full p-4 rounded-xl input-premium" placeholder="Username" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} required />
          <input type="password" className="w-full p-4 rounded-xl input-premium" placeholder="Password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} required />
          {error && <div className="text-red-400 text-xs text-center">{error}</div>}
          <button type="submit" disabled={loading} className="w-full p-4 rounded-xl btn-primary font-bold shadow-lg flex justify-center gap-2">
            {loading ? <Loader2 className="animate-spin" /> : (type === 'login' ? 'Sign In' : 'Create Account')}
          </button>
        </form>
        <div className="mt-8 text-center pt-6 border-t border-white/5">
          <button className="text-slate-400 text-sm hover:text-white" onClick={onSwitch}>{type === 'login' ? "New? Sign up" : "Have account? Login"}</button>
        </div>
      </div>
    </div>
  );
};

const Dashboard = ({ user, token, onLogout, openSnip, openHistory, openSettings }) => {
  const [bookmarks, setBookmarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [shareModalData, setShareModalData] = useState(null); 
  const [filter, setFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchBookmarks = async (isBackground = false) => {
    if (!isBackground) setSyncing(true);
    try {
      const res = await axios.get(`${API_URL}/bookmarks`, { headers: { Authorization: `Bearer ${token}` } });
      setBookmarks(res.data);
    } catch (err) { console.error("Fetch error", err); } 
    finally { 
      if(!isBackground) { setLoading(false); setSyncing(false); }
    }
  };

  useEffect(() => {
    fetchBookmarks();
    const interval = setInterval(() => fetchBookmarks(true), 15000); 
    return () => clearInterval(interval);
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newUrl) return;
    setAdding(true);
    try {
      const clientTime = new Date().toISOString();
      await axios.post(`${API_URL}/bookmarks`, { url: newUrl, clientTime }, { headers: { Authorization: `Bearer ${token}` } });
      setNewUrl('');
      fetchBookmarks();
    } catch (err) { alert('Failed to add link. Please try again.'); } 
    finally { setAdding(false); }
  };

  // PASTE HANDLER (New Feature)
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setNewUrl(text);
      }
    } catch (err) {
      // Browsers block clipboard access if permission isn't granted or context is insecure
      alert('Unable to access clipboard. Please paste manually.');
    }
  };

  const downloadCSV = () => {
    const headers = ["Title", "Price", "Currency", "URL", "Added Date", "Last Checked"];
    const rows = bookmarks.map(b => [
      `"${b.title.replace(/"/g, '""')}"`,
      b.current_price || 0,
      b.currency || 'INR',
      b.url,
      formatDate(b.created_at),
      formatDate(b.last_checked)
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `lootlook_export_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const sites = ['All', ...new Set(bookmarks.map(b => b.site_name || 'Web'))].sort();
  
  const filteredBookmarks = bookmarks.filter(b => {
    const matchesFilter = filter === 'All' || (b.site_name || 'Web') === filter;
    const matchesSearch = b.title.toLowerCase().includes(searchQuery.toLowerCase()) || b.url.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
      
      {/* RESPONSIVE NAVBAR */}
      <nav className="flex flex-col xl:flex-row justify-between items-center mb-4 gap-4 glass-panel p-4 rounded-3xl">
        
        {/* Logo Section */}
        <div className="flex items-center gap-3 w-full xl:w-auto justify-center xl:justify-start">
          <div className="bg-indigo-600/90 p-2.5 rounded-full shadow-lg shadow-indigo-600/30">
            <img src="/logo.png" className="w-8 h-8 object-contain" alt="Logo" onError={(e) => e.target.style.display='none'} />
            <ShoppingBag size={24} className="text-white hidden" /> 
          </div>
          <div className="text-left">
            <h1 className="text-xl font-bold text-white leading-none">LootLook</h1>
            <p className="text-[10px] text-indigo-300 font-medium">@{user.username}</p>
          </div>
        </div>
        
        {/* Add Link Bar with PASTE Button */}
        <form onSubmit={handleAdd} className="relative group w-full xl:max-w-lg xl:mx-4 flex items-center">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            {adding ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
          </div>
          
          <input 
            type="url" 
            placeholder="Paste link to track..." 
            className="w-full pl-12 pr-28 py-3 rounded-xl bg-slate-900/50 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm placeholder:text-slate-500" 
            value={newUrl} 
            onChange={(e) => setNewUrl(e.target.value)} 
            required 
            disabled={adding} 
          />
          
          {/* Paste Button (Only visible if input is empty) */}
          {!newUrl && (
            <button
              type="button"
              onClick={handlePaste}
              className="absolute right-16 top-1.5 bottom-1.5 px-3 text-slate-400 hover:text-indigo-400 transition-colors"
              title="Paste from Clipboard"
            >
              <ClipboardPaste size={18} />
            </button>
          )}

          <button 
            type="submit" 
            disabled={adding} 
            className="absolute right-1.5 top-1.5 bottom-1.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md transition-all"
          >
            Add
          </button>
        </form>
        
        {/* Controls Grid */}
        <div className="flex flex-wrap justify-center xl:justify-end gap-2 w-full xl:w-auto">
          
          <div className="relative flex-grow sm:flex-grow-0">
            <select 
              value={filter} 
              onChange={(e) => setFilter(e.target.value)}
              className="w-full sm:w-auto appearance-none bg-white/5 border border-white/10 text-slate-300 text-xs font-semibold rounded-xl pl-3 pr-7 py-2.5 hover:bg-white/10 focus:outline-none cursor-pointer"
            >
              {sites.map(site => <option key={site} value={site} className="bg-slate-800 text-white">{site}</option>)}
            </select>
            <Filter size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          <div className="flex gap-2">
            <button onClick={downloadCSV} className="btn-icon p-2.5 rounded-xl hover:bg-white/10 transition" title="Export CSV">
              <Download size={18} className="text-slate-300" />
            </button>

            <button onClick={() => fetchBookmarks(false)} className="btn-icon p-2.5 rounded-xl hover:bg-white/10 transition" title="Sync Now">
              <RefreshCw size={18} className={`text-slate-300 ${syncing ? 'animate-spin' : ''}`} />
            </button>
            
            <button onClick={openSettings} className="btn-icon p-2.5 rounded-xl hover:bg-white/10 transition" title="Settings">
              <Bell size={18} className="text-slate-300" />
            </button>

            <button onClick={onLogout} className="btn-icon p-2.5 rounded-xl hover:bg-red-500/20 text-slate-300 hover:text-red-400 transition border border-white/5" title="Log Out">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </nav>

      {/* SEARCH BAR */}
      <div className="mb-6 relative w-full max-w-md mx-auto xl:mx-0 xl:max-w-full">
         <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input 
              type="text" 
              placeholder="Search your stash..." 
              className="w-full pl-12 pr-4 py-2.5 rounded-xl bg-slate-800/30 border border-white/5 text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 text-sm transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                <X size={14} />
              </button>
            )}
         </div>
      </div>

      {/* Grid Content */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">{[1,2,3,4].map(i => <div key={i} className="h-80 rounded-2xl bg-white/5 animate-pulse border border-white/5"></div>)}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredBookmarks.length > 0 ? (
            filteredBookmarks.map(bm => (
              <BookmarkCard 
                key={bm.id} 
                data={bm} 
                token={token}
                refreshData={() => fetchBookmarks(true)}
                onSnip={() => openSnip(bm.image_url)}
                onHistory={() => openHistory(bm)}
                onShare={() => setShareModalData(bm)}
              />
            ))
          ) : (
            <div className="col-span-full flex flex-col items-center justify-center py-20 text-slate-500">
              <Search size={40} className="mb-4 opacity-20" />
              <p>No items found matching "{searchQuery}"</p>
            </div>
          )}
        </div>
      )}

      {shareModalData && <ShareModal bookmark={shareModalData} token={token} onClose={() => setShareModalData(null)} refreshData={() => fetchBookmarks(true)} />}
    </div>
  );
};

const BookmarkCard = ({ data, token, refreshData, onSnip, onShare, onHistory }) => {
  const [checking, setChecking] = useState(false);
  const [scanning, setScanning] = useState(false); 
  const [imgError, setImgError] = useState(false);

  useEffect(() => { setImgError(false); }, [data.image_url]);

  const fmt = (p) => {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: data.currency || 'INR', maximumFractionDigits: 0 }).format(p);
    } catch (e) { return p; }
  };

  const handleCheck = async () => {
    setChecking(true);
    try {
      await axios.post(`${API_URL}/bookmarks/${data.id}/check`, {}, { headers: { Authorization: `Bearer ${token}` } });
      refreshData();
    } catch (err) { console.error(err); } 
    finally { setChecking(false); }
  };

  const handleOCR = async () => {
    setScanning(true);
    try {
      const res = await axios.post(`${API_URL}/bookmarks/${data.id}/ocr`, {}, { headers: { Authorization: `Bearer ${token}` } });
      if(res.data.price) { alert(`Price Found: ${res.data.price}`); refreshData(); } 
      else { alert("No price detected in image."); }
    } catch (err) { alert("OCR Failed"); }
    finally { setScanning(false); }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this?")) return;
    try {
      await axios.delete(`${API_URL}/bookmarks/${data.id}`, { headers: { Authorization: `Bearer ${token}` } });
      refreshData();
    } catch (err) {}
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(data.url);
      alert('Link copied!');
    } catch (err) {
      const textArea = document.createElement("textarea");
      textArea.value = data.url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      alert('Link copied!');
    }
  };

  const priceColor = data.previous_price && data.current_price < data.previous_price ? 'text-emerald-400' : 
                     data.previous_price && data.current_price > data.previous_price ? 'text-red-400' : 'text-white';

  return (
    <div className="glass-card rounded-2xl flex flex-col h-full group">
      <div className="h-48 sm:h-56 relative overflow-hidden bg-slate-900/50 cursor-pointer" onClick={onSnip}>
        {data.image_url && !imgError ? (
          <img src={data.image_url} alt={data.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-700" onError={() => setImgError(true)} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-800"><ShoppingBag size={32} className="text-slate-600" /></div>
        )}
        
        <div className="absolute top-3 left-3 right-3 flex justify-between pointer-events-none">
          <div className="flex gap-1 flex-wrap pointer-events-auto">
            {data.is_tracked && <span className="bg-emerald-500/90 text-white text-[10px] font-bold px-2 py-1 rounded shadow backdrop-blur-md">TRACKING</span>}
            {data.shared_by && (
              <button onClick={(e) => {e.stopPropagation(); onShare();}} className="bg-purple-500/90 hover:bg-purple-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow transition">
                FROM @{data.shared_by}
              </button>
            )}
            {data.shared_with && (
              <button onClick={(e) => {e.stopPropagation(); onShare();}} className="bg-blue-500/90 hover:bg-blue-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow transition">
                TO @{data.shared_with}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-5 flex flex-col flex-grow">
        <h3 className="text-sm font-medium text-slate-200 line-clamp-2 h-10 mb-3 leading-snug" title={data.title}>{data.title}</h3>
        <div className="mt-auto mb-4">
          {data.is_tracked ? (
            <div onClick={onHistory} className="cursor-pointer hover:opacity-80 transition group/price">
              {data.previous_price && (<span className="text-xs text-slate-500 line-through mr-2">{fmt(data.previous_price)}</span>)}
              <div className={`text-xl sm:text-2xl font-bold ${priceColor} tracking-tight flex items-center gap-2`}>
                {fmt(data.current_price)}
                <TrendingUp size={16} className="text-slate-600 group-hover/price:text-indigo-400 transition-colors opacity-0 group-hover/price:opacity-100" />
              </div>
            </div>
          ) : (
            <span className="text-sm font-medium text-slate-400">Bookmark</span>
          )}
        </div>
        <div className="text-[10px] text-slate-500 mb-4 space-y-0.5 border-t border-white/5 pt-2">
          <div className="flex justify-between"><span>Updated:</span> <span className="font-mono text-slate-400">{formatDate(data.last_checked)}</span></div>
          <div className="flex justify-between"><span>Added:</span> <span className="font-mono text-slate-400">{formatDate(data.created_at)}</span></div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <button onClick={(e) => {e.stopPropagation(); handleCheck()}} className="btn-icon p-2 rounded-lg flex justify-center col-span-1 bg-slate-800/50 hover:bg-indigo-500/20 hover:text-indigo-400 transition" title="Refresh Price">
            <RefreshCw size={16} className={checking ? 'animate-spin text-indigo-400' : ''} />
          </button>
          <button onClick={onSnip} className="btn-icon p-2 rounded-lg flex justify-center col-span-1 bg-slate-800/50 hover:bg-slate-700 transition" title="View Screenshot"><Eye size={16} /></button>
          <button onClick={onShare} className="btn-icon p-2 rounded-lg flex justify-center col-span-1 bg-slate-800/50 hover:bg-slate-700 transition" title="Share Settings"><Share2 size={16} /></button>
          <button onClick={handleCopy} className="btn-icon p-2 rounded-lg flex justify-center col-span-1 bg-slate-800/50 hover:bg-slate-700 transition" title="Copy Link"><Copy size={16} /></button>
          
          <a href={data.url} target="_blank" rel="noreferrer" className="btn-icon p-2 rounded-lg flex justify-center items-center col-span-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 hover:text-indigo-300 transition border border-indigo-500/10" title="Open Website">
            <ExternalLink size={16} />
          </a>
          <button onClick={(e) => {e.stopPropagation(); handleOCR()}} className="btn-icon p-2 rounded-lg flex justify-center col-span-1 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 transition border border-teal-500/10" title="Scan Price"><ScanSearch size={16} className={scanning ? 'animate-pulse' : ''} /></button>
          <button onClick={(e) => {e.stopPropagation(); handleDelete()}} className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-400 transition flex justify-center col-span-1 border border-red-500/10" title="Delete"><Trash2 size={16} /></button>
        </div>
      </div>
    </div>
  );
};

const HistoryModal = ({ item, token, onClose }) => {
  const [data, setData] = useState([]);
  const [stats, setStats] = useState({ min: null, max: null, minDate: '', maxDate: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API_URL}/bookmarks/${item.id}/history`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        if (res.data.length === 0) return;
        let min = Infinity, max = -Infinity;
        let minDate = '', maxDate = '';
        
        const chartData = res.data.map(d => {
          const p = Number(d.price);
          const date = new Date(d.recorded_at).toLocaleDateString();
          
          if (p < min) { min = p; minDate = date; }
          if (p > max) { max = p; maxDate = date; }
          
          return { date, price: p };
        });

        setData(chartData);
        setStats({ min, max, minDate, maxDate });
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in" onClick={onClose}>
      <div className="glass-panel w-full max-w-3xl p-6 rounded-2xl relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4"><X size={20} className="text-slate-400 hover:text-white" /></button>
        <h3 className="text-xl font-bold text-white mb-1">Price History</h3>
        <p className="text-sm text-slate-400 mb-6">{item.title}</p>

        {loading ? <div className="h-80 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-500" /></div> : (
          <div className="space-y-6">
            {data.length > 0 && (
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl">
                  <p className="text-xs text-emerald-400 font-bold uppercase tracking-wider mb-1">All-Time Low</p>
                  <p className="text-2xl font-bold text-white mb-1">{item.currency} {stats.min}</p>
                  <p className="text-[10px] text-slate-400">Recorded on {stats.minDate}</p>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl">
                  <p className="text-xs text-red-400 font-bold uppercase tracking-wider mb-1">All-Time High</p>
                  <p className="text-2xl font-bold text-white mb-1">{item.currency} {stats.max}</p>
                  <p className="text-[10px] text-slate-400">Recorded on {stats.maxDate}</p>
                </div>
              </div>
            )}
            <div className="h-64 w-full">
              {data.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data}>
                    <defs>
                      <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#818cf8" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={val => `${val}`} />
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }} />
                    <Area type="monotone" dataKey="price" stroke="#818cf8" fillOpacity={1} fill="url(#colorPrice)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-500 bg-white/5 rounded-xl border border-white/5">
                  Not enough history data yet. Check back tomorrow!
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const ShareModal = ({ bookmark, token, onClose, refreshData }) => {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [currentShares, setCurrentShares] = useState([]);
  const [loading, setLoading] = useState(false);
  const isReceiver = !!bookmark.shared_by;

  useEffect(() => {
    if (!isReceiver) {
      axios.get(`${API_URL}/bookmarks/${bookmark.id}/shares`, { headers: { Authorization: `Bearer ${token}` } })
        .then(res => setCurrentShares(res.data))
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (query.length < 2) return setUsers([]);
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${API_URL}/users/search?q=${query}`, { headers: { Authorization: `Bearer ${token}` } });
        setUsers(res.data);
      } catch (e) {} finally { setLoading(false); }
    }, 500);
    return () => clearTimeout(timer);
  }, [query]);

  const shareWith = async (userId) => {
    try {
      await axios.post(`${API_URL}/bookmarks/${bookmark.id}/share`, { receiverId: userId }, { headers: { Authorization: `Bearer ${token}` } });
      const res = await axios.get(`${API_URL}/bookmarks/${bookmark.id}/shares`, { headers: { Authorization: `Bearer ${token}` } });
      setCurrentShares(res.data);
      setQuery(''); setUsers([]);
    } catch (e) { alert("Failed to share"); }
  };

  const unshareWith = async (userId) => {
    try {
      await axios.post(`${API_URL}/bookmarks/${bookmark.id}/unshare`, { receiverId: userId }, { headers: { Authorization: `Bearer ${token}` } });
      setCurrentShares(currentShares.filter(u => u.id !== userId));
    } catch (e) { alert("Failed to remove"); }
  };

  const leaveShare = async () => {
    if (!confirm(`Stop receiving "${bookmark.title}" from @${bookmark.shared_by}?`)) return;
    try {
      await axios.delete(`${API_URL}/bookmarks/${bookmark.id}`, { headers: { Authorization: `Bearer ${token}` } });
      refreshData();
      onClose();
    } catch (err) { alert("Failed to leave share"); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in" onClick={onClose}>
      <div className="glass-panel w-full max-w-md p-6 rounded-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-white">Share Settings</h3>
          <button onClick={onClose}><X size={20} className="text-slate-400 hover:text-white" /></button>
        </div>
        <p className="text-sm text-slate-400 mb-4 line-clamp-1 border-b border-white/10 pb-4">{bookmark.title}</p>
        
        {isReceiver ? (
          <div className="text-center py-4">
            <p className="text-slate-300 mb-4">Shared by <span className="text-purple-400 font-bold">@{bookmark.shared_by}</span></p>
            <button onClick={leaveShare} className="w-full py-3 bg-red-600 hover:bg-red-500 rounded-xl text-white font-bold flex items-center justify-center gap-2">
              <LeaveIcon size={18} /> Stop Receiving
            </button>
          </div>
        ) : (
          <>
            {currentShares.length > 0 && (
              <div className="mb-6">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Currently Shared With</h4>
                <div className="space-y-2">
                  {currentShares.map(u => (
                    <div key={u.id} className="flex justify-between items-center p-2 bg-white/5 rounded-lg border border-white/5">
                      <span className="text-indigo-300 font-medium text-sm">@{u.username}</span>
                      <button onClick={() => unshareWith(u.id)} className="p-1.5 bg-red-500/10 hover:bg-red-500 rounded text-red-400 hover:text-white transition"><UserMinus size={14} /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Add Person</h4>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-3 text-slate-500" size={18} />
              <input type="text" placeholder="Search username..." className="w-full pl-10 p-3 rounded-xl bg-slate-900/50 border border-white/10 text-white focus:outline-none focus:border-indigo-500" autoFocus value={query} onChange={e => setQuery(e.target.value)} />
            </div>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {loading && <div className="text-center text-slate-500 py-2">Searching...</div>}
              {users.map(u => (
                <div key={u.id} className="flex justify-between items-center p-3 hover:bg-white/5 rounded-lg transition cursor-pointer" onClick={() => shareWith(u.id)}>
                  <span className="text-white font-medium">@{u.username}</span>
                  <span className="text-xs text-indigo-400 font-bold">Add +</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const SettingsModal = ({ token, onClose }) => {
  const [settings, setSettings] = useState({ 
    ntfyUrl: '', ntfyTopic: '', notifyEnabled: false,
    notifySync: false, notifyIncrease: false,
    notifyDrop: true, notifyShare: true
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    axios.get(`${API_URL}/user/settings`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setSettings({
        ntfyUrl: res.data.ntfy_url || 'https://ntfy.sh',
        ntfyTopic: res.data.ntfy_topic || '',
        notifyEnabled: res.data.notify_enabled || false,
        notifySync: res.data.notify_on_sync_complete || false,
        notifyIncrease: res.data.notify_on_price_increase || false,
        notifyDrop: res.data.notify_on_price_drop !== false, // default true
        notifyShare: res.data.notify_on_share !== false     // default true
      }))
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    try {
      await axios.put(`${API_URL}/user/settings`, settings, { headers: { Authorization: `Bearer ${token}` } });
      alert('Settings saved!');
      onClose();
    } catch (e) { alert('Failed to save'); }
  };

  const handleTest = async () => {
    setLoading(true);
    try {
      await axios.post(`${API_URL}/user/test-notify`, settings, { headers: { Authorization: `Bearer ${token}` } });
      alert('Test notification sent!');
    } catch (e) { alert('Failed to send test. Check URL/Topic.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in" onClick={onClose}>
      <div className="glass-panel w-full max-w-md p-6 rounded-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-white">Notifications</h3>
          <button onClick={onClose}><X size={20} className="text-slate-400 hover:text-white" /></button>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
            <span className="text-sm font-medium text-white">Master Switch</span>
            <div className={`w-10 h-6 rounded-full relative cursor-pointer transition-colors ${settings.notifyEnabled ? 'bg-green-500' : 'bg-slate-600'}`} onClick={() => setSettings({...settings, notifyEnabled: !settings.notifyEnabled})}>
              <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.notifyEnabled ? 'translate-x-4' : ''}`}></div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
             <div className="flex items-center gap-2">
               <input type="checkbox" id="drop" checked={settings.notifyDrop} onChange={e => setSettings({...settings, notifyDrop: e.target.checked})} className="accent-indigo-500 w-4 h-4" />
               <label htmlFor="drop" className="text-xs text-slate-300">Price Drop Alert</label>
             </div>
             <div className="flex items-center gap-2">
               <input type="checkbox" id="inc" checked={settings.notifyIncrease} onChange={e => setSettings({...settings, notifyIncrease: e.target.checked})} className="accent-indigo-500 w-4 h-4" />
               <label htmlFor="inc" className="text-xs text-slate-300">Price Increase Alert</label>
             </div>
             <div className="flex items-center gap-2">
               <input type="checkbox" id="share" checked={settings.notifyShare} onChange={e => setSettings({...settings, notifyShare: e.target.checked})} className="accent-indigo-500 w-4 h-4" />
               <label htmlFor="share" className="text-xs text-slate-300">Shared Link Alert</label>
             </div>
             <div className="flex items-center gap-2">
               <input type="checkbox" id="sync" checked={settings.notifySync} onChange={e => setSettings({...settings, notifySync: e.target.checked})} className="accent-indigo-500 w-4 h-4" />
               <label htmlFor="sync" className="text-xs text-slate-300">Sync Complete Alert</label>
             </div>
          </div>

          <div className="space-y-2">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Ntfy Server URL</label>
              <input type="text" className="w-full p-3 mt-1 rounded-xl bg-slate-900/50 border border-white/10 text-white focus:outline-none focus:border-indigo-500" value={settings.ntfyUrl} onChange={e => setSettings({...settings, ntfyUrl: e.target.value})} placeholder="https://ntfy.sh" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Topic Name</label>
              <input type="text" className="w-full p-3 mt-1 rounded-xl bg-slate-900/50 border border-white/10 text-white focus:outline-none focus:border-indigo-500" value={settings.ntfyTopic} onChange={e => setSettings({...settings, ntfyTopic: e.target.value})} placeholder="my_secret_alerts" />
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <button onClick={handleTest} disabled={loading} className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-white font-bold text-sm">
              {loading ? 'Sending...' : 'Test'}
            </button>
            <button onClick={handleSave} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-bold text-sm">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;