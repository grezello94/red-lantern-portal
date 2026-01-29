import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, doc, onSnapshot, updateDoc, addDoc, deleteDoc } from 'firebase/firestore';
import { Share2, ArrowLeft, Plus, Minus, LogOut, Trash2, Menu, X } from 'lucide-react';

export default function App() {
  const [storeId, setStoreId] = useState(localStorage.getItem('store_id'));
  const [isAdmin, setIsAdmin] = useState(localStorage.getItem('is_admin') === 'true');
  const [screen, setScreen] = useState('home');
  const [selectedVendor, setSelectedVendor] = useState(null);
  
  // New State for the Menu Dialog
  const [showMenu, setShowMenu] = useState(false);

  const handleLogout = () => {
    localStorage.clear();
    setStoreId(null);
    setIsAdmin(false);
    setScreen('home');
    setShowMenu(false); // Close menu on logout
  };

  if (!storeId) return <LoginScreen setStoreId={setStoreId} setIsAdmin={setIsAdmin} />;

  return (
    <div className="max-w-md mx-auto min-h-screen bg-[#121212] text-white relative font-sans">
      {/* HEADER */}
      <div className="bg-gradient-to-b from-[#330000] to-[#121212] p-5 sticky top-0 z-10 border-b border-white/5 shadow-lg">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-extrabold tracking-widest text-white uppercase">Red Lantern</h1>
            <p className="text-xs text-gray-400 mt-1 font-medium tracking-wide">
              {isAdmin ? 'Admin Mode' : 'Staff Mode'}
            </p>
          </div>
          {/* Menu Button - Now opens the dialog instead of logging out */}
          <button onClick={() => setShowMenu(true)} className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition">
            <Menu size={20} className="text-white" />
          </button>
        </div>
      </div>

      {/* CONTENT */}
      <div className="p-4 pb-24">
        {screen === 'home' ? (
          <HomeScreen storeId={storeId} isAdmin={isAdmin} onVendorClick={(v) => { setSelectedVendor(v); setScreen('details'); }} />
        ) : (
          <DetailsScreen storeId={storeId} isAdmin={isAdmin} vendor={selectedVendor} onBack={() => setScreen('home')} />
        )}
      </div>

      {/* MENU DIALOG (Store Settings) */}
      {showMenu && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center p-6 z-50 animate-in fade-in duration-200">
          <div className="bg-[#1E1E1E] p-6 rounded-2xl w-full max-w-sm space-y-6 border border-white/10 shadow-2xl relative">
            <div className="flex justify-between items-center border-b border-white/5 pb-4">
              <h2 className="text-xl font-bold text-white">Store Settings</h2>
              <button onClick={() => setShowMenu(false)} className="text-gray-400 hover:text-white"><X size={24} /></button>
            </div>
            
            <div className="space-y-1">
              <p className="text-gray-400 text-sm">Store Code:</p>
              <p className="text-[#FF1744] text-3xl font-bold tracking-wider font-mono">{storeId}</p>
            </div>

            <div className="pt-4 space-y-3">
              <button onClick={() => setShowMenu(false)} 
                className="w-full bg-[#2A2A2A] text-white p-3 rounded-xl font-bold hover:bg-[#333] transition-colors">
                Close
              </button>
              <button onClick={handleLogout} 
                className="w-full border border-[#FF1744]/30 text-[#FF1744] p-3 rounded-xl font-bold hover:bg-[#FF1744]/10 transition-colors flex items-center justify-center gap-2">
                <LogOut size={18} /> Log Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- 1. LOGIN SCREEN ---
function LoginScreen({ setStoreId, setIsAdmin }) {
  const [code, setCode] = useState('');
  const [mode, setMode] = useState('selection');

  const handleLogin = (id, admin) => {
    localStorage.setItem('store_id', id);
    localStorage.setItem('is_admin', admin);
    setStoreId(id);
    setIsAdmin(admin);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#121212] p-8 text-center">
      <div className="w-24 h-24 bg-[#1E1E1E] rounded-3xl mb-6 flex items-center justify-center shadow-[0_0_30px_rgba(255,23,68,0.2)] border border-[#FF1744]/20">
        <span className="text-4xl">🏮</span>
      </div>
      <h1 className="text-3xl font-extrabold text-[#FF1744] tracking-widest mb-12 uppercase">Red Lantern</h1>

      {mode === 'selection' ? (
        <div className="w-full space-y-4 max-w-xs">
          <button onClick={() => handleLogin('RL-' + Math.random().toString(36).substr(2, 6).toUpperCase(), true)} 
            className="w-full bg-[#FF1744] text-white p-4 rounded-xl font-bold shadow-lg shadow-red-900/20 active:scale-95 transition-all">
            Create Store (Admin)
          </button>
          <button onClick={() => setMode('join')} 
            className="w-full p-4 border border-white/10 rounded-xl text-gray-300 font-semibold hover:bg-white/5 transition-all">
            Staff Login
          </button>
        </div>
      ) : (
        <div className="w-full space-y-4 max-w-xs">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} 
            placeholder="Enter Store Code" 
            className="w-full bg-[#1E1E1E] border border-white/10 text-white p-4 rounded-xl focus:border-[#FF1744] focus:outline-none transition-colors placeholder-gray-600 font-bold tracking-wider text-center" />
          <button onClick={() => code.length > 5 && handleLogin(code, false)} 
            className="w-full bg-[#FF1744] text-white p-4 rounded-xl font-bold shadow-lg active:scale-95 transition-all">
            Join Store
          </button>
          <button onClick={() => setMode('selection')} className="text-gray-500 text-sm font-medium py-2">Go Back</button>
        </div>
      )}
    </div>
  );
}

// --- 2. HOME SCREEN ---
function HomeScreen({ storeId, isAdmin, onVendorClick }) {
  const [vendors, setVendors] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'stores', storeId, 'vendors'), (snapshot) => {
      setVendors(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, [storeId]);

  const addVendor = async () => {
    if (!newName) return;
    await addDoc(collection(db, 'stores', storeId, 'vendors'), { name: newName, supplies: [] });
    setNewName(''); setShowAdd(false);
  };

  const deleteVendor = async (e, id) => {
    e.stopPropagation();
    if (confirm('Delete this vendor?')) {
      await deleteDoc(doc(db, 'stores', storeId, 'vendors', id));
    }
  };

  const inviteStaff = () => {
    const text = `Join Red Lantern Supply! Code: *${storeId}*`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`);
  };

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div onClick={inviteStaff} className="bg-[#1E1E1E] p-5 rounded-2xl flex items-center cursor-pointer border border-white/5 active:bg-[#252525] transition-colors">
          <Share2 className="text-[#FF1744] mr-4" size={24} />
          <div>
            <h3 className="font-bold text-white text-lg">Invite Staff</h3>
            <p className="text-xs text-gray-500 mt-0.5">Tap to send Code: <span className="text-gray-300">{storeId}</span></p>
          </div>
        </div>
      )}

      {vendors.map(vendor => (
        <div key={vendor.id} onClick={() => onVendorClick(vendor)} 
             className="bg-[#1E1E1E] p-5 rounded-2xl flex items-center shadow-sm border border-white/5 active:scale-[0.98] transition-all cursor-pointer">
          <div className="w-12 h-12 rounded-full bg-[#FF1744] flex items-center justify-center font-bold text-xl text-white mr-4 shadow-md shadow-red-900/30">
            {vendor.name.charAt(0)}
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-lg text-white leading-tight">{vendor.name}</h3>
            <p className="text-sm text-gray-500 mt-1 font-medium">{vendor.supplies?.length || 0} items</p>
          </div>
          {isAdmin && (
            <button onClick={(e) => deleteVendor(e, vendor.id)} className="p-2 text-gray-600 hover:text-red-500 transition-colors">
              <Trash2 size={18} />
            </button>
          )}
        </div>
      ))}

      {isAdmin && (
        <>
          <button onClick={() => setShowAdd(true)} 
            className="fixed bottom-8 right-6 w-14 h-14 bg-[#FF1744] rounded-2xl flex items-center justify-center shadow-lg shadow-red-600/30 text-white active:scale-90 transition-all z-40">
            <Plus size={28} strokeWidth={2.5} />
          </button>
          
          {showAdd && (
            <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center p-6 z-50 animate-in fade-in duration-200">
              <div className="bg-[#1E1E1E] p-6 rounded-2xl w-full max-w-sm space-y-4 border border-white/10 shadow-2xl">
                <h2 className="text-xl font-bold text-white">New Vendor</h2>
                <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} 
                  placeholder="Vendor Name" 
                  className="w-full bg-[#121212] border border-white/10 text-white p-4 rounded-xl focus:border-[#FF1744] focus:outline-none" />
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowAdd(false)} className="flex-1 p-3 rounded-xl font-bold text-gray-400 bg-white/5 hover:bg-white/10">Cancel</button>
                  <button onClick={addVendor} className="flex-1 bg-[#FF1744] text-white p-3 rounded-xl font-bold">Save</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// --- 3. DETAILS SCREEN ---
function DetailsScreen({ storeId, isAdmin, vendor, onBack }) {
  const [supplies, setSupplies] = useState(vendor.supplies || []);
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState('');

  const saveSupplies = async (newSupplies) => {
    setSupplies(newSupplies);
    await updateDoc(doc(db, 'stores', storeId, 'vendors', vendor.id), { supplies: newSupplies });
  };

  const updateQty = (index, change) => {
    const updated = [...supplies];
    updated[index].quantity = Math.max(0, updated[index].quantity + change);
    saveSupplies(updated);
  };

  const deleteItem = (idx) => {
    const updated = supplies.filter((_, i) => i !== idx);
    saveSupplies(updated);
  };

  const addItem = () => {
    if (!newItem) return;
    saveSupplies([...supplies, { id: Date.now().toString(), name: newItem, quantity: 0 }]);
    setNewItem(''); setShowAdd(false);
  };

  // --- UPDATED WHATSAPP LOGIC ---
  const sendOrder = () => {
    const activeItems = supplies.filter(i => i.quantity > 0);
    if (activeItems.length === 0) return;

    // 1. Create the Message with proper formatting
    let text = `*RED LANTERN RESTAURANT*\n`;
    text += `Date: ${new Date().toLocaleDateString()}\n`;
    text += `_Order must get delivered by 9:30am to 10:00am_\n\n`;
    text += `*VENDOR: ${vendor.name}*\n----------------\n`;
    
    // Add items with bullet points
    activeItems.forEach(item => {
      text += `• ${item.name}: *${item.quantity}*\n`; 
    });

    // 2. Encode the text
    const encodedText = encodeURIComponent(text);

    // 3. THE FIX: Detect if it's a Phone or Computer
    // Phones work better with "whatsapp://" (Deep Link)
    // Computers work better with "web.whatsapp.com"
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    if (isMobile) {
        // This forces the App to open directly (No Safari page!)
        window.location.href = `whatsapp://send?text=${encodedText}`;
    } else {
        // Desktop users go to WhatsApp Web
        window.open(`https://web.whatsapp.com/send?text=${encodedText}`, '_blank');
    }
  };

  return (
    <div className="h-full">
      <div className="flex items-center mb-6">
        <button onClick={onBack} className="p-2 -ml-2 mr-2 text-gray-400 hover:text-white"><ArrowLeft size={24} /></button>
        <h2 className="text-2xl font-bold text-white tracking-wide">{vendor.name}</h2>
      </div>

      <div className="space-y-3">
        {supplies.map((item, idx) => (
          <div key={item.id} className="bg-[#1E1E1E] p-4 rounded-xl flex items-center justify-between border border-white/5">
            <span className="font-semibold text-gray-200 text-lg flex-1 mr-4">{item.name}</span>
            <div className="flex items-center bg-[#121212] rounded-lg p-1">
              <button onClick={() => updateQty(idx, -1)} className="p-2 text-[#FF1744] hover:bg-white/5 rounded-md"><Minus size={20} strokeWidth={3} /></button>
              <span className="w-8 text-center font-bold text-lg text-white tabular-nums">{item.quantity}</span>
              <button onClick={() => updateQty(idx, 1)} className="p-2 text-[#FF1744] hover:bg-white/5 rounded-md"><Plus size={20} strokeWidth={3} /></button>
            </div>
            {isAdmin && (
              <button onClick={() => deleteItem(idx)} className="ml-3 p-2 text-gray-600 hover:text-red-500">
                <Trash2 size={18} />
              </button>
            )}
          </div>
        ))}
        {isAdmin && (
          <button onClick={() => setShowAdd(true)} 
            className="w-full py-4 text-gray-400 font-bold border border-dashed border-gray-700 rounded-xl hover:border-[#FF1744] hover:text-[#FF1744] transition-colors mt-4">
            + Add New Item
          </button>
        )}
      </div>

      <div className="fixed bottom-6 left-4 right-4 z-40">
        {supplies.some(i => i.quantity > 0) && (
          <button onClick={sendOrder} 
            className="w-full bg-[#00E676] text-black font-bold py-4 rounded-xl shadow-xl shadow-green-900/20 active:scale-[0.98] transition-all flex items-center justify-center text-lg">
            Send Order ({supplies.filter(i => i.quantity > 0).length} items)
          </button>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center p-6 z-50">
          <div className="bg-[#1E1E1E] p-6 rounded-2xl w-full max-w-sm space-y-4 border border-white/10 shadow-2xl">
            <h2 className="text-xl font-bold text-white">Add Item</h2>
            <input autoFocus value={newItem} onChange={e => setNewItem(e.target.value)} 
              placeholder="Item Name" 
              className="w-full bg-[#121212] border border-white/10 text-white p-4 rounded-xl focus:border-[#FF1744] focus:outline-none" />
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowAdd(false)} className="flex-1 p-3 rounded-xl font-bold text-gray-400 bg-white/5">Cancel</button>
              <button onClick={addItem} className="flex-1 bg-[#FF1744] text-white p-3 rounded-xl font-bold">Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}