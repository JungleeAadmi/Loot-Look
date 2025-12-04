

import React, { useState, useEffect } from 'react';
import { 
  Plus, LogOut, ExternalLink, RefreshCw, 
  ShoppingBag, Trash2, Search 
} from 'lucide-react';
import axios from 'axios';

// IMPORTANT: Vite exposes env vars on import.meta.env
const API_URL = '/api'; 

const App = () => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [view, setView] = useState('dashboard'); 

  useEffect(() => {
    if (token) {
      const storedUser = localStorage.getItem('user');
      if (storedUser) setUser(JSON.parse(storedUser));
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

  return (
    <div className="min-h-screen text-white p-4 md:p-8">
      {view === 'login' && <AuthForm type="login" onAuth={handleLogin} onSwitch={() => setView('register')} />}
      {view === 'register' && <AuthForm type="register" onAuth={handleLogin} onSwitch={() => setView('login')} />}
      {view === 'dashboard' && user && (
        <Dashboard user={user} token={token} onLogout={handleLogout} />
      )}
    </div>
  );
};

// --- Sub-Components ---
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
    <div className="flex items-center justify-center min-h-[80vh]">
      <div className="glass p-8 rounded-2xl w-full max-w-md">
        <h1 className="text-3xl font-bold mb-6 text-center text-indigo-400">LootLook</h1>
        <h2 className="text-xl mb-6 text-center text-gray-300">{type === 'login' ? 'Welcome Back' : 'Create Account'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="text" placeholder="Username" className="w-full p-3 rounded-lg input-field outline-none"
            value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} required />
          <input type="password" placeholder="Password" className="w-full p-3 rounded-lg input-field outline-none"
            value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} required />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button type="submit" disabled={loading} className="w-full p-3 rounded-lg btn-primary font-semibold disabled:opacity-50">
            {loading ? 'Processing...' : (type === 'login' ? 'Login' : 'Sign Up')}
          </button>
        </form>
        <p className="mt-6 text-center text-gray-400 text-sm cursor-pointer hover:text-white" onClick={onSwitch}>
          {type === 'login' ? "Don't have an account? Sign up" : "Already have an account? Login"}
        </p>
      </div>
    </div>
  );
};

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
    try {
      await axios.post(`${API_URL}/bookmarks/${id}/check`, {}, { headers: { Authorization: `Bearer ${token}` } });
      fetchBookmarks();
    } catch (err) { console.error(err); }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <header className="flex justify-between items-center mb-8 glass p-4 rounded-xl sticky top-4 z-10">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg"><ShoppingBag size={24} /></div>
          <div><h1 className="text-xl font-bold">LootLook</h1><p className="text-xs text-gray-400">@{user.username}</p></div>
        </div>
        <button onClick={onLogout} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white"><LogOut size={20} /></button>
      </header>

      <div className="mb-8">
        <form onSubmit={handleAdd} className="relative">
          <Search className="absolute left-4 top-3.5 text-gray-400" size={20} />
          <input type="url" placeholder="Paste Amazon/Flipkart/Blog link..." className="w-full pl-12 pr-32 py-3 rounded-xl input-field outline-none focus:border-indigo-500"
            value={newUrl} onChange={(e) => setNewUrl(e.target.value)} required />
          <button type="submit" disabled={adding} className="absolute right-2 top-2 px-4 py-1.5 rounded-lg btn-primary text-sm font-medium disabled:opacity-50">
            {adding ? 'Scraping...' : 'Add Link'}
          </button>
        </form>
      </div>

      {loading ? <div className="text-center text-gray-500 mt-20">Loading...</div> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {bookmarks.map(bm => <BookmarkCard key={bm.id} data={bm} onCheck={() => handleCheck(bm.id)} />)}
        </div>
      )}
    </div>
  );
};

const BookmarkCard = ({ data, onCheck }) => {
  const isProduct = data.is_tracked;
  const formatPrice = (p) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: data.currency || 'INR', maximumFractionDigits: 0 }).format(p);

  return (
    <div className="glass-card rounded-xl overflow-hidden flex flex-col group h-full">
      <div className="h-48 overflow-hidden relative bg-gray-900">
        {data.image_url ? (
          <img src={data.image_url} alt={data.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" onError={(e) => e.target.style.display = 'none'} />
        ) : <div className="flex items-center justify-center h-full text-gray-600"><ShoppingBag size={40} /></div>}
        {isProduct && <div className="absolute top-2 right-2 bg-green-500/80 backdrop-blur-md text-white text-xs px-2 py-1 rounded-md font-bold">TRACKING</div>}
      </div>
      <div className="p-4 flex flex-col flex-grow">
        <h3 className="font-semibold text-gray-200 line-clamp-2 mb-2 leading-tight" title={data.title}>{data.title}</h3>
        <div className="mt-auto pt-4 flex items-end justify-between">
          <div>
            {isProduct ? <div className="text-lg font-bold text-green-400">{formatPrice(data.current_price)}</div> : <div className="text-sm text-gray-500">Bookmark</div>}
            <div className="text-xs text-gray-500 mt-1">Updated: {new Date(data.last_checked).toLocaleDateString()}</div>
          </div>
          <div className="flex gap-2">
            <button onClick={onCheck} className="p-2 rounded-lg bg-gray-700/50 hover:bg-indigo-600 hover:text-white text-gray-400 transition" title="Check Price"><RefreshCw size={16} /></button>
            <a href={data.url} target="_blank" rel="noreferrer" className="p-2 rounded-lg bg-gray-700/50 hover:bg-indigo-600 hover:text-white text-gray-400 transition"><ExternalLink size={16} /></a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;