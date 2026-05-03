import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebase';
import { collection, doc, onSnapshot, updateDoc, addDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { Share2, ArrowLeft, Plus, Minus, LogOut, Trash2, Menu, X, Store, PackageOpen, ChevronRight, ShoppingBag, Send, Sun, Moon, CheckCircle2, RefreshCw } from 'lucide-react';

const DEFAULT_ORDER_MESSAGE_ID = 'delivery-window-default';
const DEFAULT_ORDER_MESSAGES = [
  { id: DEFAULT_ORDER_MESSAGE_ID, text: 'Order must get delivered by 9:30am to 10:00am' }
];

const normalizeOrderMessages = (messages) => {
  const normalized = Array.isArray(messages)
    ? messages
        .map((message) => ({
          id: typeof message?.id === 'string' && message.id.trim() ? message.id.trim() : `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          text: typeof message?.text === 'string' ? message.text.trim() : ''
        }))
        .filter((message) => message.text)
    : [];

  const unique = [];
  const seenIds = new Set();

  normalized.forEach((message) => {
    if (seenIds.has(message.id)) return;
    seenIds.add(message.id);
    unique.push(message);
  });

  return unique.length > 0 ? unique : DEFAULT_ORDER_MESSAGES;
};

const getDefaultAssignedMessageIds = (orderMessages) => {
  const messageIds = orderMessages.map((message) => message.id);
  if (messageIds.includes(DEFAULT_ORDER_MESSAGE_ID)) return [DEFAULT_ORDER_MESSAGE_ID];
  return messageIds[0] ? [messageIds[0]] : [];
};

const getVendorAssignedMessageIds = (vendor, orderMessages) => {
  const availableMessageIds = new Set(orderMessages.map((message) => message.id));

  if (Array.isArray(vendor?.assignedMessageIds)) {
    return [...new Set(vendor.assignedMessageIds.filter((id) => availableMessageIds.has(id)))];
  }

  if (vendor?.includeDeliveryWindow === false) return [];
  return getDefaultAssignedMessageIds(orderMessages);
};

export default function App() {
  const [storeId, setStoreId] = useState(localStorage.getItem('store_id'));
  const [isAdmin, setIsAdmin] = useState(localStorage.getItem('is_admin') === 'true');
  const [screen, setScreen] = useState('home');
  const [selectedVendor, setSelectedVendor] = useState(null);
  
  const [showMenu, setShowMenu] = useState(false);
  const [toast, setToast] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [orderMessages, setOrderMessages] = useState(DEFAULT_ORDER_MESSAGES);

  const [isDark, setIsDark] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme ? savedTheme === 'dark' : true;
  });

  const toggleTheme = () => {
    const newTheme = !isDark;
    setIsDark(newTheme);
    localStorage.setItem('theme', newTheme ? 'dark' : 'light');
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleLogout = () => {
    localStorage.clear();
    setStoreId(null);
    setIsAdmin(false);
    setScreen('home');
    setShowMenu(false);
  };

  const refreshApp = async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    showToast('Refreshing app...');

    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.update().catch(() => null)));
      }
    } catch (_) {
      // Ignore refresh-prep issues and continue with a hard reload.
    }

    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('refresh', Date.now().toString());
    window.location.replace(nextUrl.toString());
  };

  useEffect(() => {
    if (!storeId) return undefined;

    const unsubscribe = onSnapshot(doc(db, 'stores', storeId), (snapshot) => {
      const data = snapshot.data() || {};
      setOrderMessages(normalizeOrderMessages(data.orderMessages));
    });

    return () => unsubscribe();
  }, [storeId]);

  if (!storeId) return <LoginScreen setStoreId={setStoreId} setIsAdmin={setIsAdmin} isDark={isDark} toggleTheme={toggleTheme} />;

  return (
    <div className={`max-w-md mx-auto min-h-screen relative font-sans selection:bg-[#FF1744]/30 transition-colors duration-500 ${isDark ? 'bg-[#0a0a0a] text-white' : 'bg-gray-50 text-gray-900'}`}>
      {/* HEADER */}
      <div className={`backdrop-blur-xl p-5 sticky top-0 z-10 border-b transition-colors duration-300 ${isDark ? 'bg-black/60 border-white/5' : 'bg-white/80 border-gray-200'}`}>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-[#FF1744] to-red-900 rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(255,23,68,0.3)]">
              <span className="text-xl">🏮</span>
            </div>
            <div>
              <h1 className={`text-lg font-black tracking-widest uppercase bg-clip-text text-transparent bg-gradient-to-r ${isDark ? 'from-white to-gray-400' : 'from-gray-900 to-gray-500'}`}>Red Lantern</h1>
              <p className="text-xs text-[#FF1744] font-semibold tracking-wide flex items-center gap-1">
                {isAdmin ? <><Store size={10} /> Admin Mode</> : <><ShoppingBag size={10} /> Staff Mode</>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refreshApp} disabled={isRefreshing} className={`p-2.5 rounded-full active:scale-95 transition-all disabled:opacity-70 ${isDark ? 'bg-white/5 hover:bg-white/10 text-[#00E676]' : 'bg-gray-200 hover:bg-gray-300 text-green-700'}`}>
              <RefreshCw size={19} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
            <button onClick={toggleTheme} className={`p-2.5 rounded-full active:scale-95 transition-all ${isDark ? 'bg-white/5 hover:bg-white/10 text-yellow-400' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}>
              {isDark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button onClick={() => setShowMenu(true)} className={`p-2.5 rounded-full active:scale-95 transition-all ${isDark ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-900'}`}>
              <Menu size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* TOAST NOTIFICATION */}
      {toast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-4 fade-in duration-300 pointer-events-none">
          <div className={`px-4 py-3 rounded-full shadow-2xl flex items-center gap-2 font-bold text-sm border tracking-wide ${isDark ? 'bg-[#1a1a1a]/95 backdrop-blur-md border-white/10 text-white' : 'bg-white/95 backdrop-blur-md border-gray-200 text-gray-900'}`}>
            <CheckCircle2 size={18} className="text-[#00E676]" />
            {toast}
          </div>
        </div>
      )}

      {/* CONTENT */}
      <div className="p-5 pb-28">
        {screen === 'home' ? (
          <HomeScreen storeId={storeId} isAdmin={isAdmin} orderMessages={orderMessages} onVendorClick={(v) => { setSelectedVendor(v); setScreen('details'); }} isDark={isDark} showToast={showToast} />
        ) : (
          <DetailsScreen storeId={storeId} isAdmin={isAdmin} vendor={selectedVendor} orderMessages={orderMessages} onBack={() => setScreen('home')} isDark={isDark} showToast={showToast} />
        )}
      </div>

      {/* MENU DIALOG */}
      {showMenu && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 z-50 animate-in fade-in zoom-in-95 duration-200">
          <div className={`p-6 rounded-3xl w-full max-w-sm max-h-[85vh] overflow-y-auto space-y-6 border shadow-2xl relative overflow-x-hidden ${isDark ? 'bg-[#121212] border-white/10' : 'bg-white border-gray-200'}`}>
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#FF1744] to-red-900"></div>
            <div className="flex justify-between items-center pb-2">
              <h2 className={`text-xl font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-gray-900'}`}><Store size={20} className="text-[#FF1744]"/> Store Settings</h2>
              <button onClick={() => setShowMenu(false)} className={`transition-colors p-1.5 rounded-full ${isDark ? 'text-gray-400 hover:text-white bg-white/5' : 'text-gray-500 hover:text-gray-900 bg-gray-100'}`}><X size={20} /></button>
            </div>
            
            <div className={`p-4 rounded-2xl border ${isDark ? 'bg-black/50 border-white/5' : 'bg-gray-50 border-gray-200'}`}>
              <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">Store Code</p>
              <div className="flex items-center justify-between">
                <p className="text-[#FF1744] text-2xl font-black tracking-widest font-mono">{storeId}</p>
              </div>
            </div>

            {isAdmin && (
              <AdminOrderMessageSettings
                storeId={storeId}
                isDark={isDark}
                showToast={showToast}
              />
            )}

            <div className="pt-2 space-y-3">
              <button onClick={handleLogout} 
                className="w-full bg-red-500/10 border border-red-500/20 text-[#FF1744] p-3.5 rounded-xl font-bold hover:bg-red-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 hover:text-red-600">
                <LogOut size={18} /> Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- 1. LOGIN SCREEN ---
function LoginScreen({ setStoreId, setIsAdmin, isDark, toggleTheme }) {
  const [code, setCode] = useState('');
  const [mode, setMode] = useState('selection');

  const handleLogin = (id, admin) => {
    localStorage.setItem('store_id', id);
    localStorage.setItem('is_admin', admin);
    setStoreId(id);
    setIsAdmin(admin);
  };

  const createStore = async () => {
    const id = 'RL-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    await setDoc(doc(db, 'stores', id), { orderMessages: DEFAULT_ORDER_MESSAGES }, { merge: true });
    handleLogin(id, true);
  };

  return (
    <div className={`flex flex-col items-center justify-center min-h-screen p-8 text-center relative overflow-hidden transition-colors duration-500 ${isDark ? 'bg-[#0a0a0a]' : 'bg-gray-50'}`}>
      <button onClick={toggleTheme} className={`absolute top-6 right-6 p-3 rounded-full transition-all active:scale-95 ${isDark ? 'bg-white/5 text-yellow-400 hover:bg-white/10' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>
        {isDark ? <Sun size={20} /> : <Moon size={20} />}
      </button>
      
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#FF1744]/10 rounded-full blur-[100px] pointer-events-none"></div>

      <div className={`w-28 h-28 rounded-[2rem] mb-8 flex items-center justify-center shadow-[0_0_40px_rgba(255,23,68,0.15)] border relative z-10 transition-colors ${isDark ? 'bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border-[#FF1744]/20' : 'bg-gradient-to-br from-white to-red-50 border-red-200'}`}>
        <span className="text-5xl drop-shadow-[0_0_15px_rgba(255,23,68,0.5)]">🏮</span>
      </div>
      <h1 className={`text-4xl font-black bg-clip-text text-transparent bg-gradient-to-b tracking-widest mb-2 uppercase relative z-10 ${isDark ? 'from-white to-gray-400' : 'from-gray-900 to-gray-500'}`}>Red Lantern</h1>
      <p className={`font-medium mb-12 tracking-wide relative z-10 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Supply Management</p>

      {mode === 'selection' ? (
        <div className="w-full space-y-4 max-w-xs relative z-10">
          <button style={{ animationDelay: '0ms' }} onClick={createStore} 
            className="w-full bg-gradient-to-r from-[#FF1744] to-red-700 text-white p-4 rounded-2xl font-bold shadow-[0_10px_20px_-10px_rgba(255,23,68,0.5)] hover:shadow-[0_10px_25px_-10px_rgba(255,23,68,0.7)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-2 animate-in slide-in-from-bottom-4 fade-in fill-mode-backwards">
            <Store size={20} /> Create Store
          </button>
          <button style={{ animationDelay: '75ms' }} onClick={() => setMode('join_admin')} 
            className={`w-full p-4 border rounded-2xl font-semibold active:scale-[0.98] transition-all duration-300 animate-in slide-in-from-bottom-4 fade-in fill-mode-backwards ${isDark ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' : 'bg-white border-gray-200 text-gray-800 hover:bg-gray-50 shadow-sm'}`}>
            Admin Login
          </button>
          <button style={{ animationDelay: '150ms' }} onClick={() => setMode('join_staff')} 
            className={`w-full p-4 bg-transparent border rounded-2xl font-semibold active:scale-[0.98] transition-all duration-300 animate-in slide-in-from-bottom-4 fade-in fill-mode-backwards ${isDark ? 'border-white/5 text-gray-400 hover:text-white hover:bg-white/5' : 'border-gray-300 text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}>
            Staff Login
          </button>
        </div>
      ) : (
        <div className="w-full space-y-4 max-w-xs relative z-10 animate-in slide-in-from-bottom-4 duration-300">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} 
            placeholder={mode === 'join_admin' ? "Enter Admin Store Code" : "Enter Staff Store Code"} 
            className={`w-full border p-4 rounded-2xl focus:border-[#FF1744] focus:ring-1 focus:ring-[#FF1744] focus:outline-none transition-all font-bold tracking-widest text-center uppercase shadow-inner ${isDark ? 'bg-white/5 border-white/10 text-white placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`} />
          <button onClick={() => code.length > 5 && handleLogin(code, mode === 'join_admin')} 
            disabled={code.length <= 5}
            className="w-full bg-gradient-to-r from-[#FF1744] to-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white p-4 rounded-2xl font-bold shadow-[0_10px_20px_-10px_rgba(255,23,68,0.5)] active:scale-[0.98] transition-all duration-200">
            {mode === 'join_admin' ? 'Join as Admin' : 'Join as Staff'}
          </button>
          <button onClick={() => { setMode('selection'); setCode(''); }} className="text-gray-500 text-sm font-semibold py-4 hover:text-[#FF1744] transition-colors">← Back to Options</button>
        </div>
      )}
    </div>
  );
}

// --- 2. HOME SCREEN ---
function HomeScreen({ storeId, isAdmin, orderMessages, onVendorClick, isDark, showToast }) {
  const [vendors, setVendors] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [vendorToDelete, setVendorToDelete] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'stores', storeId, 'vendors'), (snapshot) => {
      setVendors(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, [storeId]);

  const addVendor = async () => {
    if (!newName.trim()) return;
    await addDoc(collection(db, 'stores', storeId, 'vendors'), {
      name: newName.trim(),
      supplies: [],
      assignedMessageIds: getDefaultAssignedMessageIds(orderMessages)
    });
    setNewName(''); 
    setShowAdd(false);
    showToast("Vendor added successfully!");
  };

  const confirmDelete = async () => {
    if (vendorToDelete) {
      await deleteDoc(doc(db, 'stores', storeId, 'vendors', vendorToDelete.id));
      setVendorToDelete(null);
      showToast("Vendor deleted");
    }
  };

  const deleteVendor = async (e, id) => {
    e.stopPropagation();
    const vendor = vendors.find((entry) => entry.id === id);
    if (!vendor) return;
    setVendorToDelete({ id, name: vendor.name });
  };

  const inviteStaff = () => {
    navigator.clipboard.writeText(storeId).catch(() => {});
    showToast("Store code copied & Opening WhatsApp...");
    const text = `Join Red Lantern Supply! Code: *${storeId}*`;
    setTimeout(() => {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`);
    }, 800);
  };

  return (
    <div className="space-y-6">
      {isAdmin && (
        <div onClick={inviteStaff} className={`p-5 rounded-3xl flex items-center justify-between cursor-pointer border active:scale-[0.98] transition-all shadow-lg group ${isDark ? 'bg-gradient-to-r from-[#1a1a1a] to-[#121212] border-white/5 hover:border-white/10' : 'bg-white border-gray-200 hover:border-gray-300'}`}>
          <div className="flex items-center">
            <div className="w-12 h-12 bg-[#FF1744]/10 rounded-2xl flex items-center justify-center mr-4 group-hover:bg-[#FF1744]/20 transition-colors">
              <Share2 className="text-[#FF1744]" size={22} />
            </div>
            <div>
              <h3 className={`font-bold text-base ${isDark ? 'text-white' : 'text-gray-900'}`}>Invite Staff</h3>
              <p className="text-sm text-gray-500 mt-0.5">Code: <span className={`font-mono font-bold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{storeId}</span></p>
            </div>
          </div>
          <ChevronRight size={20} className={`${isDark ? 'text-gray-600 group-hover:text-white' : 'text-gray-400 group-hover:text-gray-900'} transition-colors`} />
        </div>
      )}

      <div>
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4 px-1">Your Vendors</h2>
        
        {loading ? (
          <div className="space-y-3">
             {[1,2,3].map(i => <div key={i} className={`h-20 animate-pulse rounded-2xl ${isDark ? 'bg-white/5' : 'bg-gray-200'}`}></div>)}
          </div>
        ) : vendors.length === 0 ? (
          <div className={`text-center py-12 px-4 border rounded-3xl border-dashed ${isDark ? 'bg-white/5 border-white/5' : 'bg-white border-gray-300'}`}>
            <PackageOpen size={48} className={`mx-auto mb-4 opacity-50 ${isDark ? 'text-gray-600' : 'text-gray-400'}`} strokeWidth={1.5} />
            <h3 className={`text-lg font-bold mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>No vendors yet</h3>
            <p className="text-gray-500 text-sm">Add a vendor to start managing supplies.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {vendors.map((vendor, index) => (
              <div key={vendor.id} onClick={() => onVendorClick(vendor)} 
                   style={{ animationDelay: `${index * 50}ms` }}
                   className={`p-4 rounded-2xl flex items-center shadow-sm border active:scale-[0.98] transition-all cursor-pointer group animate-in slide-in-from-bottom-4 fade-in duration-500 fill-mode-backwards ${isDark ? 'bg-[#121212] border-white/5 hover:bg-[#1a1a1a] hover:border-white/10' : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'}`}>
                <div className={`w-14 h-14 rounded-2xl border flex items-center justify-center font-black text-xl mr-4 shadow-inner transition-colors ${isDark ? 'bg-gradient-to-br from-gray-800 to-gray-900 border-gray-700 text-white group-hover:border-gray-500' : 'bg-gradient-to-br from-gray-100 to-gray-200 border-gray-300 text-gray-700 group-hover:border-gray-400'}`}>
                  {vendor.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className={`font-bold text-lg leading-tight truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>{vendor.name}</h3>
                  <p className="text-sm text-gray-500 mt-1 font-medium flex items-center gap-1">
                    <PackageOpen size={14} /> {vendor.supplies?.length || 0} items
                  </p>
                </div>
                {isAdmin && (
                  <button onClick={(e) => deleteVendor(e, vendor.id)} className={`p-3 rounded-xl transition-all ml-2 ${isDark ? 'bg-red-500/0 text-gray-600 hover:bg-red-500/10 hover:text-red-500' : 'bg-transparent text-gray-400 hover:bg-red-50 hover:text-red-600'}`}>
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {isAdmin && (
        <>
          <button onClick={() => setShowAdd(true)} 
            className="fixed bottom-8 right-6 w-16 h-16 bg-gradient-to-r from-[#FF1744] to-red-600 rounded-full flex items-center justify-center shadow-[0_10px_25px_-5px_rgba(255,23,68,0.5)] hover:shadow-[0_10px_30px_-5px_rgba(255,23,68,0.6)] text-white hover:-translate-y-1 active:translate-y-0 active:scale-95 transition-all duration-200 z-40">
            <Plus size={32} strokeWidth={2.5} />
          </button>
          
          {showAdd && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 z-50 animate-in fade-in duration-200">
              <div className={`p-6 rounded-[2rem] w-full max-w-sm space-y-5 border shadow-2xl animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 ${isDark ? 'bg-[#121212] border-white/10' : 'bg-white border-gray-200'}`}>
                <div className="flex justify-between items-center">
                  <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Add New Vendor</h2>
                  <button onClick={() => setShowAdd(false)} className={`p-2 rounded-full ${isDark ? 'bg-white/5 text-gray-400 hover:text-white' : 'bg-gray-100 text-gray-500 hover:text-gray-900'}`}><X size={20}/></button>
                </div>
                <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} 
                  onKeyDown={e => e.key === 'Enter' && addVendor()}
                  placeholder="e.g. Fresh Produce Co." 
                  className={`w-full border p-4 rounded-2xl focus:border-[#FF1744] focus:ring-1 focus:ring-[#FF1744] focus:outline-none transition-all ${isDark ? 'bg-black/50 border-white/10 text-white placeholder-gray-600' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400'}`} />
                <button onClick={addVendor} disabled={!newName.trim()} className="w-full bg-[#FF1744] disabled:opacity-50 disabled:cursor-not-allowed text-white p-4 rounded-2xl font-bold shadow-lg active:scale-[0.98] transition-all hover:bg-red-600">
                  Save Vendor
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* DELETE VENDOR MODAL */}
      <DeleteConfirmModal
        confirmTarget={vendorToDelete}
        isDark={isDark}
        title="Delete Vendor?"
        description="This action cannot be undone. All supplies for this vendor will be lost."
        confirmLabel="Delete Vendor"
        onClose={() => setVendorToDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

// --- 3. DETAILS SCREEN ---
function DetailsScreen({ storeId, isAdmin, vendor, orderMessages, onBack, isDark, showToast }) {
  const [supplies, setSupplies] = useState(vendor.supplies || []);
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState('');
  const [itemToDelete, setItemToDelete] = useState(null);
  const holdTimeoutRef = useRef(null);
  const holdIntervalRef = useRef(null);
  const holdTicksRef = useRef(0);
  const skipPersistRef = useRef(true);
  const showToastRef = useRef(showToast);
  const lastHapticRef = useRef(0);

  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  useEffect(() => {
    setSupplies(vendor.supplies || []);
    setItemToDelete(null);
    skipPersistRef.current = true;
    stopAdjustPress();
  }, [vendor]);

  useEffect(() => {
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }

    const timeoutId = setTimeout(() => {
      updateDoc(doc(db, 'stores', storeId, 'vendors', vendor.id), {
        supplies
      }).catch(() => {
        showToastRef.current("Couldn't save changes");
      });
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [storeId, supplies, vendor.id]);

  useEffect(() => () => stopAdjustPress(), []);

  const updateSuppliesState = (updater) => {
    setSupplies((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      return next;
    });
  };

  const triggerHaptic = (mode = 'repeat') => {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;

    const now = Date.now();
    const cooldown = mode === 'press' ? 0 : 90;
    if (now - lastHapticRef.current < cooldown) return;

    lastHapticRef.current = now;
    navigator.vibrate(mode === 'press' ? [28, 18, 22] : 16);
  };

  const applyQtyChange = (index, direction, step = 1, hapticMode = 'repeat') => {
    triggerHaptic(hapticMode);
    updateSuppliesState((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;

      return {
        ...item,
        quantity: Math.max(0, item.quantity + (direction * step))
      };
    }));
  };

  const getHoldStep = (ticks) => {
    if (ticks > 18) return 10;
    if (ticks > 8) return 5;
    return 1;
  };

  const stopAdjustPress = () => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }

    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }

    holdTicksRef.current = 0;
  };

  const startAdjustPress = (index, direction) => {
    stopAdjustPress();
    applyQtyChange(index, direction, 1, 'press');
    holdTicksRef.current = 0;

    holdTimeoutRef.current = setTimeout(() => {
      holdIntervalRef.current = setInterval(() => {
        holdTicksRef.current += 1;
        applyQtyChange(index, direction, getHoldStep(holdTicksRef.current), 'repeat');
      }, 120);
    }, 300);
  };

  const confirmDeleteItem = async () => {
    if (!itemToDelete) return;

    setSupplies((current) => current.filter((_, index) => index !== itemToDelete.index));
    setItemToDelete(null);
    showToast("Item removed");
  };

  const addItem = () => {
    if (!newItem.trim()) return;
    updateSuppliesState((current) => [
      ...current,
      { id: Date.now().toString(), name: newItem.trim(), quantity: 0 }
    ]);
    setNewItem(''); 
    setShowAdd(false);
    showToast("Item added!");
  };

  const sendOrder = () => {
    const activeItems = supplies.filter(i => i.quantity > 0);
    if (activeItems.length === 0) return;

    showToast("Preparing order...");

    const assignedMessageIds = getVendorAssignedMessageIds(vendor, orderMessages);
    const vendorMessages = orderMessages.filter((message) => assignedMessageIds.includes(message.id));

    let text = `*RED LANTERN RESTAURANT*\n`;
    text += `Date: ${new Date().toLocaleDateString()}\n`;
    vendorMessages.forEach((message) => {
      text += `_${message.text}_\n`;
    });
    text += '\n';
    text += `*VENDOR: ${vendor.name}*\n----------------\n`;
    
    activeItems.forEach(item => {
      text += `• ${item.name}: *${item.quantity}*\n`; 
    });

    const encodedText = encodeURIComponent(text);
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    setTimeout(() => {
      if (isMobile) {
        window.location.href = `whatsapp://send?text=${encodedText}`;
      } else {
        window.open(`https://web.whatsapp.com/send?text=${encodedText}`, '_blank');
      }
    }, 600);
  };

  const totalActiveItems = supplies.filter(i => i.quantity > 0).length;

  return (
    <div className="h-full flex flex-col">
      <div className={`flex items-center mb-6 pb-4 border-b ${isDark ? 'border-white/5' : 'border-gray-200'}`}>
        <button onClick={onBack} className={`p-2 -ml-2 mr-3 rounded-full active:scale-95 transition-all ${isDark ? 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10' : 'bg-gray-100 text-gray-600 hover:text-gray-900 hover:bg-gray-200'}`}>
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className={`text-xl font-black truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>{vendor.name}</h2>
          <p className="text-xs text-gray-500 font-medium mt-0.5">{supplies.length} registered items</p>
        </div>
      </div>

      <div className="space-y-3 flex-1">
        {supplies.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${isDark ? 'bg-white/5' : 'bg-gray-100'}`}>
              <PackageOpen size={32} className="text-gray-500" />
            </div>
            <h3 className={`text-lg font-bold mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>No items listed</h3>
            <p className="text-gray-500 text-sm mb-6">Add items that you order from this vendor.</p>
            {isAdmin && (
              <button onClick={() => setShowAdd(true)} className="px-6 py-3 bg-[#FF1744]/10 text-[#FF1744] font-bold rounded-xl hover:bg-[#FF1744]/20 transition-colors inline-flex items-center gap-2">
                <Plus size={18} /> Add First Item
              </button>
            )}
          </div>
        ) : (
          supplies.map((item, idx) => (
            <div key={item.id} className={`p-4 rounded-2xl flex items-center justify-between border transition-all duration-300 ${
              item.quantity > 0 
                ? isDark ? 'bg-[#FF1744]/10 border-[#FF1744]/30 shadow-[0_0_15px_rgba(255,23,68,0.05)]' : 'bg-red-50 border-red-200 shadow-sm'
                : isDark ? 'bg-[#121212] border-white/5 hover:border-white/10' : 'bg-white border-gray-200 hover:border-gray-300 shadow-sm'
            } animate-in slide-in-from-bottom-2 fade-in fill-mode-backwards`} style={{ animationDelay: `${idx * 30}ms` }}>
              <div className="flex-1 mr-4 min-w-0">
                <span className={`font-bold text-base truncate block transition-colors ${
                  item.quantity > 0 ? 'text-[#FF1744]' : (isDark ? 'text-gray-200' : 'text-gray-700')
                }`}>{item.name}</span>
              </div>
              <div className={`flex items-center gap-2 rounded-2xl px-2 py-1.5 border ${isDark ? 'bg-black/40 border-white/5' : 'bg-gray-100 border-gray-200'}`}>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture?.(e.pointerId);
                    if (item.quantity > 0) startAdjustPress(idx, -1);
                  }}
                  onPointerUp={stopAdjustPress}
                  onPointerLeave={stopAdjustPress}
                  onPointerCancel={stopAdjustPress}
                  onContextMenu={(e) => e.preventDefault()}
                  disabled={item.quantity === 0}
                  className={`h-11 w-11 flex items-center justify-center rounded-xl transition-colors disabled:opacity-30 disabled:bg-transparent select-none touch-none ${isDark ? 'bg-white/5 text-gray-300 hover:text-white hover:bg-white/10' : 'bg-white text-gray-700 hover:text-gray-900 hover:bg-gray-200 shadow-sm'}`}
                >
                  <Minus size={20} strokeWidth={3.25} />
                </button>
                <span className={`w-10 text-center font-black text-xl tabular-nums ${item.quantity > 0 ? (isDark ? 'text-white' : 'text-gray-900') : 'text-gray-500'}`}>{item.quantity}</span>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture?.(e.pointerId);
                    startAdjustPress(idx, 1);
                  }}
                  onPointerUp={stopAdjustPress}
                  onPointerLeave={stopAdjustPress}
                  onPointerCancel={stopAdjustPress}
                  onContextMenu={(e) => e.preventDefault()}
                  className="h-11 w-11 flex items-center justify-center rounded-xl bg-[#FF1744]/12 text-[#FF1744] hover:bg-[#FF1744]/20 transition-colors select-none touch-none"
                >
                  <Plus size={20} strokeWidth={3.25} />
                </button>
              </div>
              {isAdmin && (
                <button onClick={() => setItemToDelete({ index: idx, name: item.name })} className={`ml-2 p-2.5 rounded-xl transition-colors ${isDark ? 'text-gray-600 hover:bg-red-500/10 hover:text-red-500' : 'text-gray-400 hover:bg-red-50 hover:text-red-600'}`}>
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          ))
        )}
        
        {isAdmin && supplies.length > 0 && (
          <button onClick={() => setShowAdd(true)} 
            className={`w-full py-4 font-bold border-2 border-dashed rounded-2xl transition-all mt-4 flex items-center justify-center gap-2 ${isDark ? 'border-gray-800 text-gray-400 hover:border-gray-600 hover:text-white bg-white/[0.02]' : 'border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-800 bg-gray-50'}`}>
            <Plus size={20} /> Add New Item
          </button>
        )}
      </div>

      {totalActiveItems > 0 && (
        <div className="fixed bottom-6 left-0 right-0 px-4 z-40 max-w-md mx-auto animate-in slide-in-from-bottom-8 duration-300">
          <button onClick={sendOrder} 
            className="w-full bg-[#00E676] text-black font-black py-4 px-6 rounded-2xl shadow-[0_10px_25px_-5px_rgba(0,230,118,0.4)] active:scale-[0.98] transition-all flex items-center justify-between text-lg group hover:shadow-[0_10px_30px_-5px_rgba(0,230,118,0.5)]">
            <span className="flex items-center gap-2"><Send size={20} className="group-hover:translate-x-1 transition-transform" /> Send Order</span>
            <span className="bg-black/20 px-3 py-1 rounded-lg text-sm">{totalActiveItems} {totalActiveItems === 1 ? 'item' : 'items'}</span>
          </button>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className={`p-6 rounded-[2rem] w-full max-w-sm space-y-5 border shadow-2xl animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 ${isDark ? 'bg-[#121212] border-white/10' : 'bg-white border-gray-200'}`}>
             <div className="flex justify-between items-center">
              <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Add New Item</h2>
              <button onClick={() => setShowAdd(false)} className={`p-2 rounded-full ${isDark ? 'bg-white/5 text-gray-400 hover:text-white' : 'bg-gray-100 text-gray-500 hover:text-gray-900'}`}><X size={20}/></button>
            </div>
            <input autoFocus value={newItem} onChange={e => setNewItem(e.target.value)} 
              onKeyDown={e => e.key === 'Enter' && addItem()}
              placeholder="e.g. Tomato Sauce" 
              className={`w-full border p-4 rounded-2xl focus:border-[#FF1744] focus:ring-1 focus:ring-[#FF1744] focus:outline-none transition-all ${isDark ? 'bg-black/50 border-white/10 text-white placeholder-gray-600' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400'}`} />
            <button onClick={addItem} disabled={!newItem.trim()} className="w-full bg-[#FF1744] disabled:opacity-50 disabled:cursor-not-allowed text-white p-4 rounded-2xl font-bold shadow-lg active:scale-[0.98] transition-all hover:bg-red-600">
              Add Item
            </button>
          </div>
        </div>
      )}

      <DeleteConfirmModal
        confirmTarget={itemToDelete}
        isDark={isDark}
        title="Delete Item?"
        description="Type 0000 to confirm removing this item from the vendor list."
        confirmLabel="Delete Item"
        onClose={() => setItemToDelete(null)}
        onConfirm={confirmDeleteItem}
      />
    </div>
  );
}

function AdminOrderMessageSettings({ storeId, isDark, showToast }) {
  const [savedMessages, setSavedMessages] = useState(DEFAULT_ORDER_MESSAGES);
  const [draftMessages, setDraftMessages] = useState(DEFAULT_ORDER_MESSAGES);
  const [newMessage, setNewMessage] = useState('');
  const [vendors, setVendors] = useState([]);
  const [isSavingMessages, setIsSavingMessages] = useState(false);
  const [savingVendorId, setSavingVendorId] = useState(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'stores', storeId), (snapshot) => {
      const data = snapshot.data() || {};
      const normalized = normalizeOrderMessages(data.orderMessages);
      setSavedMessages(normalized);
      setDraftMessages(normalized);
    });

    return () => unsubscribe();
  }, [storeId]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'stores', storeId, 'vendors'), (snapshot) => {
      setVendors(snapshot.docs.map((vendorDoc) => ({ id: vendorDoc.id, ...vendorDoc.data() })));
    });

    return () => unsubscribe();
  }, [storeId]);

  const updateDraftMessage = (id, text) => {
    setDraftMessages((current) => current.map((message) => (
      message.id === id ? { ...message, text } : message
    )));
  };

  const addDraftMessage = () => {
    if (!newMessage.trim()) return;

    setDraftMessages((current) => [
      ...current,
      { id: `msg-${Date.now()}`, text: newMessage.trim() }
    ]);
    setNewMessage('');
  };

  const removeDraftMessage = (id) => {
    if (draftMessages.length === 1) {
      showToast('Keep at least one message template');
      return;
    }

    setDraftMessages((current) => current.filter((message) => message.id !== id));
  };

  const saveMessages = async () => {
    setIsSavingMessages(true);

    const sanitizedMessages = normalizeOrderMessages(draftMessages);
    const removedMessageIds = savedMessages
      .map((message) => message.id)
      .filter((id) => !sanitizedMessages.some((message) => message.id === id));

    try {
      await setDoc(doc(db, 'stores', storeId), { orderMessages: sanitizedMessages }, { merge: true });

      if (removedMessageIds.length > 0) {
        const vendorUpdates = vendors
          .map((vendor) => {
            const nextAssignedIds = getVendorAssignedMessageIds(vendor, savedMessages)
              .filter((id) => !removedMessageIds.includes(id));

            if (nextAssignedIds.length === getVendorAssignedMessageIds(vendor, savedMessages).length) return null;

            return updateDoc(doc(db, 'stores', storeId, 'vendors', vendor.id), {
              assignedMessageIds: nextAssignedIds
            });
          })
          .filter(Boolean);

        await Promise.all(vendorUpdates);
      }

      showToast('Order messages saved');
    } catch (_) {
      showToast("Couldn't save order messages");
    } finally {
      setIsSavingMessages(false);
    }
  };

  const toggleVendorMessage = async (vendor, messageId, checked) => {
    const currentAssignedIds = getVendorAssignedMessageIds(vendor, savedMessages);
    const nextAssignedIds = checked
      ? [...new Set([...currentAssignedIds, messageId])]
      : currentAssignedIds.filter((id) => id !== messageId);

    setSavingVendorId(vendor.id);
    setVendors((current) => current.map((entry) => (
      entry.id === vendor.id ? { ...entry, assignedMessageIds: nextAssignedIds } : entry
    )));

    try {
      await updateDoc(doc(db, 'stores', storeId, 'vendors', vendor.id), {
        assignedMessageIds: nextAssignedIds
      });
    } catch (_) {
      showToast("Couldn't update vendor messages");
      setVendors((current) => current.map((entry) => (
        entry.id === vendor.id ? { ...entry, assignedMessageIds: currentAssignedIds } : entry
      )));
    } finally {
      setSavingVendorId(null);
    }
  };

  const hasUnsavedChanges = JSON.stringify(normalizeOrderMessages(draftMessages)) !== JSON.stringify(savedMessages);

  return (
    <div className={`rounded-2xl border p-4 space-y-4 ${isDark ? 'bg-black/40 border-white/5' : 'bg-gray-50 border-gray-200'}`}>
      <div>
        <h3 className={`font-bold text-base ${isDark ? 'text-white' : 'text-gray-900'}`}>Vendor Order Messages</h3>
        <p className="text-sm text-gray-500 mt-1">Create message templates here, then assign the right ones to each vendor below.</p>
      </div>

      <div className="space-y-3">
        {draftMessages.map((message, index) => (
          <div key={message.id} className="flex items-start gap-2">
            <textarea
              value={message.text}
              onChange={(e) => updateDraftMessage(message.id, e.target.value)}
              rows={2}
              placeholder={`Message ${index + 1}`}
              className={`flex-1 border p-3 rounded-2xl focus:border-[#FF1744] focus:ring-1 focus:ring-[#FF1744] focus:outline-none transition-all resize-none ${isDark ? 'bg-[#121212] border-white/10 text-white placeholder-gray-600' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`}
            />
            <button
              onClick={() => removeDraftMessage(message.id)}
              className={`mt-1 p-2.5 rounded-xl transition-colors ${isDark ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-start gap-2">
        <textarea
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          rows={2}
          placeholder="Add another message template"
          className={`flex-1 border p-3 rounded-2xl focus:border-[#FF1744] focus:ring-1 focus:ring-[#FF1744] focus:outline-none transition-all resize-none ${isDark ? 'bg-[#121212] border-white/10 text-white placeholder-gray-600' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`}
        />
        <button
          onClick={addDraftMessage}
          disabled={!newMessage.trim()}
          className="mt-1 px-4 py-3 rounded-2xl bg-[#FF1744] text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </div>

      <button
        onClick={saveMessages}
        disabled={!hasUnsavedChanges || isSavingMessages}
        className="w-full bg-[#FF1744] text-white p-3.5 rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSavingMessages ? 'Saving Messages...' : 'Save Messages'}
      </button>

      <div className="space-y-3 pt-1">
        <div>
          <h4 className={`font-bold text-sm uppercase tracking-wider ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Assign Per Vendor</h4>
          <p className="text-sm text-gray-500 mt-1">Open a vendor and check only the messages that should appear in that vendor’s order.</p>
        </div>

        {vendors.length === 0 ? (
          <div className={`rounded-2xl border border-dashed p-4 text-sm text-gray-500 ${isDark ? 'border-white/10 bg-[#121212]' : 'border-gray-300 bg-white'}`}>
            Add vendors first, then you can assign messages here.
          </div>
        ) : (
          vendors.map((vendor) => {
            const assignedMessageIds = getVendorAssignedMessageIds(vendor, savedMessages);

            return (
              <details key={vendor.id} className={`rounded-2xl border ${isDark ? 'border-white/10 bg-[#121212]' : 'border-gray-300 bg-white'}`}>
                <summary className="list-none cursor-pointer p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className={`font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{vendor.name}</p>
                    <p className="text-sm text-gray-500">{assignedMessageIds.length} message{assignedMessageIds.length === 1 ? '' : 's'} selected</p>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${isDark ? 'bg-white/5 text-gray-300' : 'bg-gray-100 text-gray-700'}`}>
                    Assign
                  </span>
                </summary>
                <div className="px-4 pb-4 space-y-2">
                  {savedMessages.map((message) => (
                    <label key={message.id} className={`flex items-start gap-3 rounded-xl border p-3 ${isDark ? 'border-white/5 bg-black/30' : 'border-gray-200 bg-gray-50'}`}>
                      <input
                        type="checkbox"
                        checked={assignedMessageIds.includes(message.id)}
                        disabled={savingVendorId === vendor.id}
                        onChange={(e) => toggleVendorMessage(vendor, message.id, e.target.checked)}
                        className="mt-1 h-4 w-4 accent-[#FF1744]"
                      />
                      <span className={`text-sm ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{message.text}</span>
                    </label>
                  ))}
                </div>
              </details>
            );
          })
        )}
      </div>
    </div>
  );
}

function DeleteConfirmModal({ confirmTarget, isDark, title, description, confirmLabel, onClose, onConfirm }) {
  const [confirmationCode, setConfirmationCode] = useState('');

  useEffect(() => {
    setConfirmationCode('');
  }, [confirmTarget]);

  if (!confirmTarget) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div className={`p-6 rounded-[2rem] w-full max-w-sm space-y-5 border shadow-2xl animate-in zoom-in-95 ${isDark ? 'bg-[#121212] border-white/10' : 'bg-white border-gray-200'}`}>
        <h3 className={`text-xl font-bold text-center ${isDark ? 'text-white' : 'text-gray-900'}`}>{title}</h3>
        <div className="space-y-2 text-center">
          <p className="text-sm text-gray-500">{description}</p>
          <p className={`font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Type <span className="text-[#FF1744] font-mono">0000</span> to delete {confirmTarget.name ? `"${confirmTarget.name}"` : 'this item'}.
          </p>
        </div>
        <input
          autoFocus
          value={confirmationCode}
          onChange={(e) => setConfirmationCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && confirmationCode === '0000') {
              onConfirm();
            }
          }}
          placeholder='Type 0000 to confirm'
          className={`w-full border p-4 rounded-2xl focus:border-[#FF1744] focus:ring-1 focus:ring-[#FF1744] focus:outline-none transition-all text-center font-bold tracking-[0.3em] ${isDark ? 'bg-black/50 border-white/10 text-white placeholder-gray-600' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400'}`}
        />
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className={`flex-1 py-3 rounded-xl font-bold transition-all ${isDark ? 'bg-white/5 text-white hover:bg-white/10' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'}`}>Cancel</button>
          <button
            onClick={onConfirm}
            disabled={confirmationCode !== '0000'}
            className="flex-1 py-3 rounded-xl font-bold bg-red-500 text-white hover:bg-red-600 transition-all shadow-lg shadow-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
