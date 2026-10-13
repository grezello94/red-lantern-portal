import { collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, setDoc, arrayUnion } from 'firebase/firestore';
import { db } from './firebase';

export const DEFAULT_ORDER_MESSAGES = [
  { id: 'delivery-window-default', text: 'Please deliver between 9:30am and 10:00am.' },
];
export const ITEM_UNITS = ['KG', 'PIECES', 'BUNDLE'];
export const normalizeItemUnit = (unit) => typeof unit === 'string' && unit.trim()
  ? unit.trim().replace(/\s+/g, ' ').toUpperCase()
  : 'PIECES';
export const normalizeItemUnits = (units) => [...new Set([
  ...ITEM_UNITS,
  ...(Array.isArray(units) ? units.filter((unit) => typeof unit === 'string' && unit.trim()).map(normalizeItemUnit) : []),
])];
export const normalizeSupplies = (supplies) => Array.isArray(supplies) ? supplies
  .filter((item) => typeof item?.name === 'string' && item.name.trim())
  .map((item, index) => ({ ...item, id: item.id || `item-${index}`, quantity: Number.isFinite(Number(item.quantity)) ? Math.max(0, Number(item.quantity)) : 0, unit: normalizeItemUnit(item.unit) })) : [];

export function normalizeOrderMessages(messages) {
  if (!Array.isArray(messages)) return DEFAULT_ORDER_MESSAGES;
  const seen = new Set();
  const result = messages.filter((message) => message?.id && typeof message.text === 'string' && message.text.trim() && !seen.has(message.id) && seen.add(message.id))
    .map((message) => ({ id: message.id, text: message.text.trim() }));
  return result.length ? result : DEFAULT_ORDER_MESSAGES;
}

export function getVendorAssignedMessageIds(supplier, messages) {
  const ids = new Set(messages.map((message) => message.id));
  if (Array.isArray(supplier?.assignedMessageIds)) return [...new Set(supplier.assignedMessageIds.filter((id) => ids.has(id)))];
  if (supplier?.includeDeliveryWindow === false) return [];
  return ids.has('delivery-window-default') ? ['delivery-window-default'] : messages[0] ? [messages[0].id] : [];
}

export function formatOrderMessage({ supplier, items, messages = [], note = '', date = new Date() }) {
  return [
    '*RED LANTERN RESTAURANT*',
    `Date: ${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}`,
    `*SUPPLIER: ${supplier.name}*`,
    '',
    ...items.filter((item) => item.quantity > 0).map((item) => `• ${item.name}: *${item.quantity} ${normalizeItemUnit(item.unit)}*`),
    ...(messages.length ? ['', ...messages.map((message) => `_${message.text}_`)] : []),
    ...(note.trim() ? ['', `Note: ${note.trim()}`] : []),
    '',
    'Please confirm availability. Thank you!',
  ].join('\n');
}

const DEMO_KEY = 'red_lantern_demo_v1';
const DEMO_EVENT = 'red-lantern-demo-change';
const INITIAL_DEMO = {
  orderMessages: DEFAULT_ORDER_MESSAGES,
  itemUnits: ITEM_UNITS,
  suppliers: [
    { id: 'fresh', name: 'Fresh Harvest', supplies: [{ id: 'tomato', name: 'Tomatoes', unit: 'KG', quantity: 5 }, { id: 'onion', name: 'Red onions', unit: 'KG', quantity: 3 }, { id: 'coriander', name: 'Fresh coriander', unit: 'BUNDLE', quantity: 0 }, { id: 'potato', name: 'Potatoes', unit: 'KG', quantity: 0 }, { id: 'pepper', name: 'Bell peppers', unit: 'KG', quantity: 0 }], assignedMessageIds: ['delivery-window-default'] },
    { id: 'pantry', name: 'The Pantry Co.', supplies: [{ id: 'rice', name: 'Basmati rice', unit: 'KG', quantity: 0 }, { id: 'flour', name: 'All-purpose flour', unit: 'KG', quantity: 0 }, { id: 'oil', name: 'Cooking oil bottles', unit: 'PIECES', quantity: 0 }, { id: 'sauce', name: 'Soy sauce bottles', unit: 'PIECES', quantity: 0 }], assignedMessageIds: ['delivery-window-default'] },
    { id: 'dairy', name: 'Morning Dairy', supplies: [{ id: 'milk', name: 'Milk cartons', unit: 'PIECES', quantity: 0 }, { id: 'paneer', name: 'Paneer', unit: 'KG', quantity: 0 }, { id: 'butter', name: 'Butter', unit: 'KG', quantity: 0 }], assignedMessageIds: ['delivery-window-default'] },
    { id: 'pack', name: 'EcoPack Supplies', supplies: [{ id: 'containers', name: 'Takeaway containers', unit: 'PIECES', quantity: 0 }, { id: 'bags', name: 'Paper bags', unit: 'PIECES', quantity: 0 }, { id: 'napkins', name: 'Napkin bundles', unit: 'BUNDLE', quantity: 0 }], assignedMessageIds: [] },
  ],
};

function readDemo() {
  try { return JSON.parse(localStorage.getItem(DEMO_KEY)) || structuredClone(INITIAL_DEMO); }
  catch { return structuredClone(INITIAL_DEMO); }
}

function writeDemo(data) {
  localStorage.setItem(DEMO_KEY, JSON.stringify(data));
  window.dispatchEvent(new Event(DEMO_EVENT));
}

function subscribeDemo(select, callback) {
  const emit = () => callback(select(readDemo()));
  emit();
  window.addEventListener(DEMO_EVENT, emit);
  window.addEventListener('storage', emit);
  return () => { window.removeEventListener(DEMO_EVENT, emit); window.removeEventListener('storage', emit); };
}

export function subscribeSuppliers(storeId, callback, onError) {
  if (storeId === 'demo') return subscribeDemo((data) => data.suppliers, callback);
  return onSnapshot(collection(db, 'stores', storeId, 'vendors'), (snapshot) => callback(snapshot.docs.map((entry) => ({ ...entry.data(), id: entry.id }))), onError);
}

export function subscribeStore(storeId, callback, onError) {
  if (storeId === 'demo') return subscribeDemo((data) => ({ orderMessages: data.orderMessages, itemUnits: data.itemUnits }), callback);
  return onSnapshot(doc(db, 'stores', storeId), (snapshot) => callback(snapshot.data() || {}), onError);
}

export async function createStore() {
  const id = `RL-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  await setDoc(doc(db, 'stores', id), { orderMessages: DEFAULT_ORDER_MESSAGES, itemUnits: ITEM_UNITS });
  return id;
}

export async function createSupplier(storeId, supplier) {
  if (storeId === 'demo') {
    const data = readDemo();
    const id = crypto.randomUUID();
    data.suppliers.push({ ...supplier, id });
    writeDemo(data);
    return { id };
  }
  return addDoc(collection(db, 'stores', storeId, 'vendors'), supplier);
}

export async function updateSupplier(storeId, id, changes) {
  if (storeId === 'demo') {
    const data = readDemo();
    data.suppliers = data.suppliers.map((supplier) => supplier.id === id ? { ...supplier, ...changes } : supplier);
    writeDemo(data);
    return;
  }
  return updateDoc(doc(db, 'stores', storeId, 'vendors', id), changes);
}

export async function deleteSupplier(storeId, id) {
  if (storeId === 'demo') {
    const data = readDemo();
    data.suppliers = data.suppliers.filter((supplier) => supplier.id !== id);
    writeDemo(data);
    return;
  }
  return deleteDoc(doc(db, 'stores', storeId, 'vendors', id));
}

export async function saveStore(storeId, changes) {
  if (storeId === 'demo') { writeDemo({ ...readDemo(), ...changes }); return; }
  return setDoc(doc(db, 'stores', storeId), changes, { merge: true });
}

export async function addItemUnit(storeId, name) {
  if (typeof name !== 'string' || !name.trim()) throw new Error('Enter a unit name.');
  if (/[\u0000-\u001f\u007f]/.test(name)) throw new Error('Use a readable unit name.');
  const unit = normalizeItemUnit(name);
  if (unit.length > 24) throw new Error('Unit names can contain up to 24 characters.');
  if (storeId === 'demo') {
    const data = readDemo();
    writeDemo({ ...data, itemUnits: normalizeItemUnits([...normalizeItemUnits(data.itemUnits), unit]) });
    return;
  }
  // Atomic additions preserve units added by another admin at the same time.
  return setDoc(doc(db, 'stores', storeId), { itemUnits: arrayUnion(...ITEM_UNITS, unit) }, { merge: true });
}
