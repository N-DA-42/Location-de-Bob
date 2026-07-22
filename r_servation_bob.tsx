import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc } from 'firebase/firestore';

// --- Configuration Cloud Partagée ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- Utilitaires de dates ---
const normalizeDate = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const isSameDay = (d1, d2) => {
  if (!d1 || !d2) return false;
  return normalizeDate(d1).getTime() === normalizeDate(d2).getTime();
};

const isDateBetween = (date, start, end) => {
  if (!start || !end) return false;
  const t = normalizeDate(date).getTime();
  return t > normalizeDate(start).getTime() && t < normalizeDate(end).getTime();
};

const ChevronLeft = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
);

const ChevronRight = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
);

const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
);

const CalendarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
);

export default function BobBookingApp() {
  // --- États ---
  // Utilisateur connecté
  const [user, setUser] = useState(null);

  // Dates d'affichage du calendrier
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  // Sélection de l'utilisateur
  const [selection, setSelection] = useState({ start: null, end: null });
  const [options, setOptions] = useState({ cooler: false, shower: false, bed: false });
  const [userName, setUserName] = useState('');
  
  // Feedback UI
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Réservations existantes (Synchronisées)
  const [bookings, setBookings] = useState([]);

  // --- Connexion & Synchronisation ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) {
        console.error("Auth error:", e);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    
    // Écoute en temps réel des réservations partagées
    const bookingsRef = collection(db, 'artifacts', appId, 'public', 'data', 'bookings');
    const unsubscribe = onSnapshot(bookingsRef, (snapshot) => {
      const fetchedBookings = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          start: new Date(data.start),
          end: new Date(data.end),
          name: data.name,
          options: data.options
        };
      });
      setBookings(fetchedBookings);
    }, (error) => {
      console.error("Erreur de synchronisation:", error);
    });

    return () => unsubscribe();
  }, [user]);

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  // Vérifie si une date est déjà réservée
  const isDateBooked = (date) => {
    const dTime = normalizeDate(date).getTime();
    return bookings.some(b => {
      return dTime >= normalizeDate(b.start).getTime() && dTime <= normalizeDate(b.end).getTime();
    });
  };

  // Vérifie si des jours sont réservés entre deux dates
  const hasBookingBetween = (start, end) => {
    const s = normalizeDate(start).getTime();
    const e = normalizeDate(end).getTime();
    
    return bookings.some(b => {
      const bStart = normalizeDate(b.start).getTime();
      const bEnd = normalizeDate(b.end).getTime();
      // Y a-t-il un chevauchement ?
      return (bStart <= e && bEnd >= s);
    });
  };

  const handleDateClick = (date) => {
    setErrorMsg('');
    setSuccessMessage('');
    const clickedDate = normalizeDate(date);
    const today = normalizeDate(new Date());

    if (clickedDate.getTime() < today.getTime()) return; // Pas dans le passé
    if (isDateBooked(clickedDate)) return; // Déjà réservé

    if (!selection.start || (selection.start && selection.end)) {
      // Nouvelle sélection
      setSelection({ start: clickedDate, end: null });
    } else {
      // Fin de la sélection
      if (clickedDate.getTime() <= selection.start.getTime()) {
        // Clic avant la date de début : on redéfinit le début
        setSelection({ start: clickedDate, end: null });
      } else {
        // Clic après : on vérifie les conflits
        if (hasBookingBetween(selection.start, clickedDate)) {
          setErrorMsg("Ces dates chevauchent une réservation existante.");
          setSelection({ start: clickedDate, end: null });
        } else {
          setSelection({ ...selection, end: clickedDate });
        }
      }
    }
  };

  const handleBooking = async () => {
    if (!selection.start || !selection.end) {
      setErrorMsg("Veuillez sélectionner une date de début et de fin.");
      return;
    }
    if (!userName.trim()) {
      setErrorMsg("Veuillez indiquer votre prénom.");
      return;
    }
    if (!user) {
      setErrorMsg("Connexion au planning partagé en cours...");
      return;
    }

    const newBooking = {
      start: selection.start.toISOString(),
      end: selection.end.toISOString(),
      name: userName,
      options: { ...options },
      createdAt: new Date().toISOString()
    };

    try {
      const bookingsRef = collection(db, 'artifacts', appId, 'public', 'data', 'bookings');
      await addDoc(bookingsRef, newBooking);
      
      // Reset et feedback
      setSuccessMessage(`Super ${userName} ! Bob est réservé du ${selection.start.toLocaleDateString()} au ${selection.end.toLocaleDateString()}.`);
      setSelection({ start: null, end: null });
      setOptions({ cooler: false, shower: false, bed: false });
      setUserName('');
      setErrorMsg('');
    } catch (error) {
      console.error("Erreur lors de la réservation:", error);
      setErrorMsg("Erreur lors de l'enregistrement de la réservation. Veuillez réessayer.");
    }
  };

  const renderCalendar = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7; // Lundi comme premier jour
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    const today = normalizeDate(new Date());

    // Cases vides début du mois
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(<div key={`empty-${i}`} className="h-10 w-10"></div>);
    }

    // Jours du mois
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month, i);
      const isPast = normalizeDate(date).getTime() < today.getTime();
      const booked = isDateBooked(date);
      
      const isStart = isSameDay(date, selection.start);
      const isEnd = isSameDay(date, selection.end);
      const isBetween = isDateBetween(date, selection.start, selection.end);
      
      let baseClasses = "h-10 w-10 flex items-center justify-center text-sm rounded-full transition-all duration-200 ";
      
      if (isPast) {
        baseClasses += "text-gray-300 cursor-not-allowed";
      } else if (booked) {
        baseClasses += "bg-red-50 text-red-300 line-through cursor-not-allowed";
      } else if (isStart || isEnd) {
        baseClasses += "bg-[#8ba888] text-white font-bold shadow-md cursor-pointer scale-110";
      } else if (isBetween) {
        baseClasses += "bg-[#d8e3d7] text-[#2d3a2c] cursor-pointer rounded-none";
      } else {
        baseClasses += "text-gray-700 hover:bg-gray-100 cursor-pointer";
      }

      days.push(
        <button
          key={i}
          disabled={isPast || booked}
          onClick={() => handleDateClick(date)}
          className={baseClasses}
        >
          {i}
        </button>
      );
    }

    return days;
  };

  const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  const dayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  return (
    <div className="min-h-screen bg-[#F9FAF9] text-[#2d3a2c] font-sans">
      
      {/* Navigation Minimaliste */}
      <nav className="border-b border-gray-100 bg-white/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-[#8ba888] flex items-center justify-center text-white text-lg">B</span>
            BOB.
          </div>
          <div className="text-sm font-medium text-gray-500">Planning partagé</div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-12">
        
        {/* Section Héro */}
        <div className="flex flex-col md:flex-row gap-12 items-center mb-16">
          <div className="flex-1 space-y-6">
            <h1 className="text-5xl font-extrabold tracking-tight text-[#1a2319] leading-tight">
              Prenez la route, <br/>sans vous prendre <span className="text-[#8ba888]">la tête.</span>
            </h1>
            <p className="text-lg text-gray-600 max-w-md leading-relaxed">
              Vérifiez les disponibilités de Bob, choisissez vos options et réservez vos dates en quelques clics. 
            </p>
          </div>
          <div className="flex-1 w-full">
            <div className="relative rounded-3xl overflow-hidden shadow-2xl aspect-[4/3] bg-gray-200">
              <img 
                src="peugeot-boxer-peugeot-boxer-vert_9585905656.jpg" 
                alt="Bob le Van" 
                className="object-cover w-full h-full hover:scale-105 transition-transform duration-700"
                onError={(e) => {
                  e.target.onerror = null; 
                  e.target.src = "https://placehold.co/800x600/8ba888/ffffff?text=Bob+Le+Van";
                }}
              />
            </div>
          </div>
        </div>

        {/* Section Interface de réservation */}
        <div className="bg-white rounded-[2rem] shadow-xl shadow-gray-200/50 p-8 md:p-12 border border-gray-50">
          <div className="flex items-center gap-4 mb-10">
            <div className="p-3 bg-[#f2f6f2] rounded-2xl text-[#8ba888]">
              <CalendarIcon />
            </div>
            <h2 className="text-3xl font-bold text-[#1a2319]">Organiser un séjour</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
            
            {/* Colonne Gauche : Calendrier */}
            <div className="space-y-6">
              <div className="flex items-center justify-between mb-6 bg-[#f9faf9] p-2 rounded-2xl">
                <button onClick={prevMonth} className="p-3 hover:bg-white rounded-xl transition-colors shadow-sm"><ChevronLeft /></button>
                <h3 className="text-lg font-bold w-48 text-center">{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</h3>
                <button onClick={nextMonth} className="p-3 hover:bg-white rounded-xl transition-colors shadow-sm"><ChevronRight /></button>
              </div>
              
              <div className="grid grid-cols-7 gap-y-4 gap-x-2 text-center">
                {dayNames.map(day => (
                  <div key={day} className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{day}</div>
                ))}
                {renderCalendar()}
              </div>

              {/* Légende minimaliste */}
              <div className="flex gap-4 mt-8 text-sm text-gray-500 justify-center">
                <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-50 border border-red-100"></div> Indisponible</span>
                <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#8ba888]"></div> Sélection</span>
              </div>
            </div>

            {/* Colonne Droite : Options & Formulaire */}
            <div className="flex flex-col h-full space-y-10">
              
              {/* Options */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-4">Équipements optionnels</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { id: 'cooler', label: 'Glacière' },
                    { id: 'shower', label: 'Douche' },
                    { id: 'bed', label: '3e lit' }
                  ].map((opt) => (
                    <label 
                      key={opt.id} 
                      className={`relative flex flex-col items-center justify-center p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                        options[opt.id] 
                          ? 'border-[#8ba888] bg-[#f4f7f4] text-[#2d3a2c]' 
                          : 'border-gray-100 hover:border-gray-200 text-gray-500'
                      }`}
                    >
                      <input 
                        type="checkbox" 
                        className="sr-only" 
                        checked={options[opt.id]}
                        onChange={() => setOptions({...options, [opt.id]: !options[opt.id]})}
                      />
                      <span className="font-medium">{opt.label}</span>
                      {options[opt.id] && (
                        <div className="absolute top-2 right-2 text-[#8ba888]">
                          <CheckIcon />
                        </div>
                      )}
                    </label>
                  ))}
                </div>
              </div>

              {/* Validation */}
              <div className="bg-[#f9faf9] p-6 rounded-3xl mt-auto">
                {successMessage ? (
                  <div className="text-center space-y-4 py-4">
                    <div className="w-16 h-16 bg-[#8ba888] rounded-full flex items-center justify-center mx-auto text-white shadow-lg">
                      <CheckIcon />
                    </div>
                    <p className="font-semibold text-lg">{successMessage}</p>
                    <button 
                      onClick={() => setSuccessMessage('')}
                      className="text-sm text-[#8ba888] font-medium hover:underline"
                    >
                      Faire une nouvelle réservation
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-semibold uppercase tracking-widest text-gray-400 mb-2">Qui réserve ?</label>
                      <input 
                        type="text" 
                        value={userName}
                        onChange={(e) => setUserName(e.target.value)}
                        placeholder="Votre prénom..."
                        className="w-full px-5 py-4 rounded-xl border-none ring-1 ring-gray-200 focus:ring-2 focus:ring-[#8ba888] bg-white outline-none transition-all placeholder:text-gray-300 font-medium"
                      />
                    </div>

                    {errorMsg && <p className="text-red-500 text-sm font-medium">{errorMsg}</p>}

                    <button 
                      onClick={handleBooking}
                      className="w-full bg-[#2d3a2c] hover:bg-[#1a2319] text-white py-4 rounded-xl font-bold text-lg shadow-xl shadow-gray-900/10 transition-all hover:-translate-y-0.5 active:translate-y-0 flex justify-between items-center px-6"
                    >
                      <span>Réserver Bob</span>
                      <ChevronRight />
                    </button>

                    {/* Résumé textuel */}
                    <p className="text-xs text-center text-gray-400 font-medium h-4">
                      {selection.start && !selection.end && `Sélectionnez la date de fin...`}
                      {selection.start && selection.end && `Du ${selection.start.toLocaleDateString()} au ${selection.end.toLocaleDateString()}`}
                    </p>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
        
      </main>
    </div>
  );
}