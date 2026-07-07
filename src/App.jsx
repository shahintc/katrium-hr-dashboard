import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import katriumLogo from './katrium_logo.webp' 

const initialCandidateState = {
  Name: '', Country: '', Phone: '', Email: '', Gmail: '',
  'Native language': '', 'Native English (or above C1)': 'No',
  'Native level lang': '', 'Good level lang.': '', 'Basic level lang.': '',
  'Date of application': '', 'Position applied for': '', 'Email Answer': '',
  'Last Contact Date': '', 
  'Additional comments & notes from Katrium': ''
};

function App() {
  // --- AUTHENTICATION STATES ---
  const [session, setSession] = useState(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState(null);

  // --- EXISTING DASHBOARD STATES ---
  const [candidates, setCandidates] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCandidates, setTotalCandidates] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0); 
  const itemsPerPage = 100;

  // --- NEW / UPDATED SEARCH & FILTER STATES ---
  const [searchTerm, setSearchTerm] = useState('');
  const [emailFilter, setEmailFilter] = useState(''); 
  const [nativeLanguageFilter, setNativeLanguageFilter] = useState(''); 
  const [goodLanguageFilter, setGoodLanguageFilter] = useState(''); 
  const [statusFilter, setStatusFilter] = useState(''); 
  const [sortOption, setSortOption] = useState('ID-desc'); 
  
  const [selectedCandidate, setSelectedCandidate] = useState(null); 
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newCandidate, setNewCandidate] = useState(initialCandidateState);
  const [editingCandidate, setEditingCandidate] = useState(null);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedForDeletion, setSelectedForDeletion] = useState([]);

  // --- AUTHENTICATION EFFECT ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // --- LOGIN FUNCTION ---
  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });

    if (error) setAuthError(error.message);
    setAuthLoading(false);
  };

  // --- EXISTING FUNCTIONS ---
  const formatDisplayDate = (dateStr) => {
    if (!dateStr || dateStr === 'N/A') return 'N/A';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  // Trigger page reset when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, emailFilter, nativeLanguageFilter, goodLanguageFilter, statusFilter, sortOption]); 

  useEffect(() => {
    async function getCandidates() {
      if (!session) return; 

      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase
        .from('candidates')
        .select('*', { count: 'exact' }); 

      // 1. Apply Text Searches
      if (searchTerm) query = query.ilike('Name', `%${searchTerm}%`);
      if (emailFilter) query = query.or(`Email.ilike.%${emailFilter}%,Gmail.ilike.%${emailFilter}%`);
      
      // --- UPDATED LOGIC: Specific Language Filters ---
      if (nativeLanguageFilter) query = query.ilike('Native language', `%${nativeLanguageFilter}%`);
      
      // Search BOTH Good and Basic language columns for the "Secondary" language search
      if (goodLanguageFilter) {
        query = query.or(`"Good level lang.".ilike.%${goodLanguageFilter}%,"Basic level lang.".ilike.%${goodLanguageFilter}%`);
      }

      // --- NEW LOGIC: Contact Status Filter ---
      if (statusFilter) {
        if (statusFilter === 'UNASSIGNED') {
          // Catch any variation of an empty or missing status
          query = query.or(`"Email Answer".is.null,"Email Answer".eq.,"Email Answer".eq.N/A,"Email Answer".eq.n/a`);
        } else {
          // Exact match for the selected dropdown option
          query = query.eq('Email Answer', statusFilter);
        }
      }

      // 2. Apply Sorting OR Missing Data Filters
      if (sortOption.startsWith('Missing-')) {
        const dbCol = sortOption.replace('Missing-', ''); 
        query = query.or(`"${dbCol}".is.null,"${dbCol}".eq.,"${dbCol}".eq.N/A,"${dbCol}".eq.n/a`);
        query = query.order('ID', { ascending: false });
      } else {
        // Normal Sorting Behavior
        const [sortCol, sortDir] = sortOption.split('-'); 
        let actualDbColumn = 'ID';
        if (sortCol === 'Name') actualDbColumn = 'Name';
        if (sortCol === 'Date') actualDbColumn = 'Date of application';
        if (sortCol === 'LastContact') actualDbColumn = 'Last Contact Date';
        
        // Hide missing/N/A data from standard sorting
        if (sortCol !== 'ID') {
          query = query
            .not(actualDbColumn, 'is', null)
            .neq(actualDbColumn, '')
            .neq(actualDbColumn, 'N/A')
            .neq(actualDbColumn, 'n/a');
        }
        
        query = query.order(actualDbColumn, { ascending: sortDir === 'asc' });
      }

      // 3. Execute with Pagination
      const { data, count, error } = await query.range(from, to); 
      
      if (error) {
        console.error("Error fetching data:", error);
      } else {
        setCandidates(data); 
        if (count !== null) {
          setTotalCandidates(count);
          setTotalPages(Math.ceil(count / itemsPerPage) || 1); 
        }
      }
    }
    
    getCandidates();
  }, [currentPage, refreshTrigger, searchTerm, emailFilter, nativeLanguageFilter, goodLanguageFilter, statusFilter, sortOption, session]); 

  const handleAddCandidate = async () => {
    const emailToCheck = newCandidate.Email?.trim();
    const gmailToCheck = newCandidate.Gmail?.trim();

    if (!newCandidate.Name?.trim() || !newCandidate.Country?.trim() || !newCandidate['Date of application']?.trim() || !emailToCheck || !newCandidate['Native language']?.trim()) { 
      alert("Please fill in all mandatory fields marked with an asterisk (*)."); 
      return; 
    }

    // --- DUPLICATE PREVENTION LOGIC ---
    let checkConditions = `Email.eq."${emailToCheck}",Gmail.eq."${emailToCheck}"`;
    if (gmailToCheck) {
      checkConditions += `,Email.eq."${gmailToCheck}",Gmail.eq."${gmailToCheck}"`;
    }

    const { data: existingCandidates, error: checkError } = await supabase
      .from('candidates')
      .select('ID')
      .or(checkConditions);

    if (checkError) {
      console.error("Error checking duplicates:", checkError);
      alert("Failed to validate candidate data. Please try again.");
      return;
    }

    if (existingCandidates && existingCandidates.length > 0) {
      alert("A candidate with this Email or Gmail already exists in the database. Please check your records.");
      return;
    }

    // Convert empty string to null for optional Last Contact Date
    const payloadToInsert = {
      ...newCandidate,
      'Last Contact Date': newCandidate['Last Contact Date'] === '' ? null : newCandidate['Last Contact Date']
    };

    const { error } = await supabase.from('candidates').insert([payloadToInsert]);
    if (error) { console.error("Error adding:", error); alert("Failed to add."); } 
    else { setIsAddModalOpen(false); setNewCandidate(initialCandidateState); setRefreshTrigger(prev => prev + 1); setCurrentPage(1); }
  };

  const handleUpdateCandidate = async () => {
    if (!editingCandidate.Name?.trim() || !editingCandidate.Country?.trim() || !editingCandidate['Date of application']?.trim() || !editingCandidate.Email?.trim() || !editingCandidate['Native language']?.trim()) { 
      alert("Please fill in all mandatory fields marked with an asterisk (*)."); 
      return; 
    }

    // Convert empty string to null for optional Last Contact Date
    const payloadToUpdate = {
      ...editingCandidate,
      'Last Contact Date': editingCandidate['Last Contact Date'] === '' ? null : editingCandidate['Last Contact Date']
    };

    const { error } = await supabase.from('candidates').update(payloadToUpdate).eq('ID', editingCandidate.ID);
    if (error) { console.error("Error updating:", error); alert("Failed to update."); } 
    else { setEditingCandidate(null); setRefreshTrigger(prev => prev + 1); }
  };

  const toggleSelection = (id) => {
    if (selectedForDeletion.includes(id)) setSelectedForDeletion(prev => prev.filter(item => item !== id));
    else setSelectedForDeletion(prev => [...prev, id]);
  };

  const executeDelete = async () => {
    if (selectedForDeletion.length === 0) return;
    if (!window.confirm(`Are you sure you want to permanently delete ${selectedForDeletion.length} candidate(s)?`)) return;
    const { error } = await supabase.from('candidates').delete().in('ID', selectedForDeletion);
    if (error) { console.error("Error deleting:", error); alert("Failed to delete."); } 
    else { setIsDeleteMode(false); setSelectedForDeletion([]); setRefreshTrigger(prev => prev + 1); }
  };

  // --- LIGHT MODE KATRIUM STYLES ---
  const katriumBlue = '#004bb5'; 
  const katriumLightBg = '#f4f7fa'; 

  const modalOverlayStyle = { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0, 0, 0, 0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 };
  const modalBoxStyle = { backgroundColor: '#ffffff', padding: '30px', borderRadius: '8px', width: '90%', maxWidth: '700px', border: '1px solid #ddd', color: '#333', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' };
  
  const btnStyle = { padding: '8px 16px', backgroundColor: '#ffffff', color: katriumBlue, border: `1px solid ${katriumBlue}`, borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' };
  const disabledBtnStyle = { ...btnStyle, opacity: 0.5, cursor: 'not-allowed', backgroundColor: '#f1f1f1', color: '#999', borderColor: '#ddd' };
  const inputStyle = { width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#ffffff', color: '#333' };

  // --- RENDER LOGIN SCREEN IF NOT LOGGED IN ---
  if (!session) {
    return (
      <div style={{ backgroundColor: katriumLightBg, minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', fontFamily: 'Arial, sans-serif' }}>
        <div style={{ backgroundColor: '#ffffff', padding: '40px', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px', textAlign: 'center', border: '1px solid #ddd' }}>
          <img src={katriumLogo} alt="Katrium Logo" style={{ height: '70px', marginBottom: '20px' }} />
          <h2 style={{ color: katriumBlue, marginTop: '0', marginBottom: '20px' }}>HR Dashboard Login</h2>
          
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {authError && <div style={{ backgroundColor: '#ff475715', color: '#dc3545', padding: '10px', borderRadius: '4px', border: '1px solid #dc3545', fontSize: '14px' }}>{authError}</div>}
            <input type="email" placeholder="Email Address" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required style={inputStyle} />
            <input type="password" placeholder="Password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required style={inputStyle} />
            <button type="submit" disabled={authLoading} style={{ ...btnStyle, backgroundColor: katriumBlue, color: 'white', marginTop: '10px', padding: '12px' }}>
              {authLoading ? 'Verifying...' : 'Log In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- RENDER MAIN DASHBOARD IF LOGGED IN ---
  return (
    <div style={{ padding: '40px', fontFamily: 'Arial, sans-serif', position: 'relative', backgroundColor: katriumLightBg, minHeight: '100vh', color: '#333' }}>
      
      {/* Header & Main Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <img src={katriumLogo} alt="Katrium Logo" style={{ height: '55px', width: '55px', objectFit: 'contain', backgroundColor: 'white', borderRadius: '50%', padding: '2px', border: '1px solid #ddd' }} />
          <div>
            <h1 style={{ color: katriumBlue, margin: '0 0 5px 0' }}>Katrium HR Dashboard</h1>
            <p style={{ color: '#555', margin: 0 }}>Found {totalCandidates} candidates | Page {currentPage} of {totalPages}</p>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => setIsAddModalOpen(true)} style={{ ...btnStyle, backgroundColor: '#28a745', color: 'white', borderColor: '#28a745' }}>+ Add Candidate</button>
          <button onClick={() => { setIsDeleteMode(!isDeleteMode); setSelectedForDeletion([]); }} style={{ ...btnStyle, backgroundColor: isDeleteMode ? '#dc3545' : '#6c757d', color: 'white', borderColor: isDeleteMode ? '#dc3545' : '#6c757d' }}>
            {isDeleteMode ? 'Cancel Deletion' : 'Delete Mode'}
          </button>
          <button onClick={() => supabase.auth.signOut()} style={{ ...btnStyle, backgroundColor: '#f8f9fa', color: '#dc3545', borderColor: '#dc3545', marginLeft: '10px' }}>
            Sign Out
          </button>
        </div>
      </div>

      {/* Delete Execution Bar */}
      {isDeleteMode && (
        <div style={{ backgroundColor: '#ffeeba', border: '1px solid #ffc107', padding: '15px', borderRadius: '8px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#856404', fontWeight: 'bold' }}>Delete Mode Active: ({selectedForDeletion.length} selected)</span>
          <button onClick={executeDelete} disabled={selectedForDeletion.length === 0} style={{ padding: '8px 16px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: selectedForDeletion.length > 0 ? 'pointer' : 'not-allowed', opacity: selectedForDeletion.length > 0 ? 1 : 0.5 }}>Confirm Delete</button>
        </div>
      )}

      {/* --- UPDATED CONTROL PANEL (Search Bars & Status Filter) --- */}
      <div style={{ display: 'flex', gap: '15px', marginBottom: '15px', flexWrap: 'wrap' }}>
        <input type="text" placeholder="Search Database by Name..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ padding: '10px', width: '250px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#fff', color: '#333' }} />
        <input type="text" placeholder="Search by Email / Gmail..." value={emailFilter} onChange={(e) => setEmailFilter(e.target.value)} style={{ padding: '10px', width: '250px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#fff', color: '#333' }} />
        <input type="text" placeholder="Search by Native Language..." value={nativeLanguageFilter} onChange={(e) => setNativeLanguageFilter(e.target.value)} style={{ padding: '10px', width: '220px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#fff', color: '#333' }} />
        <input type="text" placeholder="Search by Good/Basic Lang..." value={goodLanguageFilter} onChange={(e) => setGoodLanguageFilter(e.target.value)} style={{ padding: '10px', width: '220px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#fff', color: '#333' }} />
        
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: '10px', width: '220px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#fff', color: '#333' }}>
          <option value="">All Contact Statuses</option>
          <option value="UNASSIGNED">N/A / Unassigned</option>
          <option value="No">No</option>
          <option value="Yes-Awaiting Reply">Yes-Awaiting Reply</option>
          <option value="Yes-Answered (Interested)">Yes-Answered (Interested)</option>
          <option value="Yes-Answered (Not-interested)">Yes-Answered (Not-interested)</option>
        </select>
      </div>

      {/* Control Panel (Sorting & Missing Data Filter) */}
      <div style={{ display: 'flex', gap: '20px', marginBottom: '30px', alignItems: 'center', backgroundColor: '#ffffff', padding: '15px', borderRadius: '8px', border: '1px solid #ddd', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ color: '#333', fontWeight: 'bold' }}>Sort / Filter By:</label>
          <select value={sortOption} onChange={(e) => setSortOption(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: 'white', color: '#333' }}>
            <optgroup label="Standard Sorting">
              <option value="ID-desc">Newest Added</option>
              <option value="ID-asc">Oldest Added</option>
              <option value="Name-asc">Name (A-Z)</option>
              <option value="Name-desc">Name (Z-A)</option>
              <option value="Date-desc">Application Date (Newest)</option>
              <option value="Date-asc">Application Date (Oldest)</option>
              <option value="LastContact-desc">Last Contact Date (Newest)</option>
              <option value="LastContact-asc">Last Contact Date (Oldest)</option>
            </optgroup>
            <optgroup label="Fix Missing Data (N/A or Blank)">
              <option value="Missing-Name">Show Missing: Name</option>
              <option value="Missing-Country">Show Missing: Country</option>
              <option value="Missing-Native language">Show Missing: Native Lang</option>
              <option value="Missing-Email">Show Missing: Email</option>
              <option value="Missing-Date of application">Show Missing: App Date</option>
            </optgroup>
          </select>
        </div>
      </div>

      {/* Pagination Controls */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', alignItems: 'center' }}>
        <button style={currentPage === 1 ? disabledBtnStyle : btnStyle} onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>&lt;&lt; First</button>
        <button style={currentPage === 1 ? disabledBtnStyle : btnStyle} onClick={() => setCurrentPage((prev) => prev - 1)} disabled={currentPage === 1}>&lt; Prev</button>
        <span style={{ color: '#555', margin: '0 10px', fontWeight: 'bold' }}>Page {currentPage} of {totalPages}</span>
        <button style={currentPage === totalPages ? disabledBtnStyle : btnStyle} onClick={() => setCurrentPage((prev) => prev + 1)} disabled={currentPage === totalPages}>Next &gt;</button>
        <button style={currentPage === totalPages ? disabledBtnStyle : btnStyle} onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>Last &gt;&gt;</button>
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gap: '20px', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
        {candidates.map((candidate) => {
          const isSelected = selectedForDeletion.includes(candidate.ID);
          return (
            <div key={candidate.ID} style={{ border: isSelected ? '2px solid #dc3545' : '1px solid #ddd', borderRadius: '8px', padding: '20px', backgroundColor: isSelected ? '#ff475715' : '#ffffff', cursor: isDeleteMode ? 'pointer' : 'default', transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }} onClick={() => { if (isDeleteMode) toggleSelection(candidate.ID); }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h3 style={{ marginTop: '0', color: katriumBlue }}>{candidate.Name}</h3>
                {isDeleteMode && <input type="checkbox" checked={isSelected} readOnly style={{ transform: 'scale(1.5)', cursor: 'pointer' }} />}
              </div>
              <div style={{ color: '#555', lineHeight: '1.6' }}>
                <p style={{ margin: '4px 0' }}><strong>Country:</strong> {candidate.Country || 'N/A'}</p>
                <p style={{ margin: '4px 0' }}><strong>Native Lang:</strong> {candidate['Native language'] || 'N/A'}</p>
                <p style={{ margin: '4px 0' }}><strong>Contact Status:</strong> {candidate['Email Answer'] || 'N/A'}</p>
                <p style={{ margin: '4px 0', color: '#d9534f' }}><strong>Last Contact:</strong> {formatDisplayDate(candidate['Last Contact Date']) || 'Never'}</p>
              </div>
              {!isDeleteMode && (
                <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                  <button onClick={(e) => { e.stopPropagation(); setSelectedCandidate(candidate); }} style={{ flex: 2, padding: '8px', backgroundColor: '#f8f9fa', color: katriumBlue, border: `1px solid ${katriumBlue}`, borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>View Profile</button>
                  <button onClick={(e) => { e.stopPropagation(); setEditingCandidate(candidate); }} style={{ flex: 1, padding: '8px', backgroundColor: katriumBlue, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Edit</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ADD CANDIDATE MODAL */}
      {isAddModalOpen && (
        <div style={modalOverlayStyle}>
          <div style={modalBoxStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ddd', paddingBottom: '10px', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, color: '#28a745' }}>Add New Candidate</h2>
              <button onClick={() => setIsAddModalOpen(false)} style={{ padding: '5px 10px', cursor: 'pointer', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px' }}>Close</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div><label style={{color: '#555', fontSize: '12px', fontWeight: 'bold'}}>Name *</label><br/><input style={inputStyle} type="text" value={newCandidate.Name} onChange={(e) => setNewCandidate({...newCandidate, Name: e.target.value})} /></div>
              <div><label style={{color: '#555', fontSize: '12px', fontWeight: 'bold'}}>Country *</label><br/><input style={inputStyle} type="text" value={newCandidate.Country} onChange={(e) => setNewCandidate({...newCandidate, Country: e.target.value})} /></div>
              <div><label style={{color: '#555', fontSize: '12px', fontWeight: 'bold'}}>Phone</label><br/><input style={inputStyle} type="text" value={newCandidate.Phone} onChange={(e) => setNewCandidate({...newCandidate, Phone: e.target.value})} /></div>
              <div><label style={{color: '#555', fontSize: '12px', fontWeight: 'bold'}}>Date of Application *</label><br/><input style={inputStyle} type="date" value={newCandidate['Date of application']} onChange={(e) => setNewCandidate({...newCandidate, 'Date of application': e.target.value})} /></div>
              <div><label style={{color: '#555', fontSize: '12px', fontWeight: 'bold'}}>Email *</label><br/><input style={inputStyle} type="email" value={newCandidate.Email} onChange={(e) => setNewCandidate({...newCandidate, Email: e.target.value})} /></div>
              <div><label style={{color: '#555', fontSize: '12px', fontWeight: 'bold'}}>Gmail</label><br/><input style={inputStyle} type="email" value={newCandidate.Gmail} onChange={(e) => setNewCandidate({...newCandidate, Gmail: e.target.value})} /></div>
              <div><label style={{color: '#555', fontSize: '12px', fontWeight: 'bold'}}>Native Language *</label><br/><input style={inputStyle} type="text" value={newCandidate['Native language']} onChange={(e) => setNewCandidate({...newCandidate, 'Native language': e.target.value})} /></div>
              <div><label style={{color: '#555', fontSize: '12px', fontWeight: 'bold'}}>Native English (C1+)</label><br/><select style={inputStyle} value={newCandidate['Native English (or above C1)']} onChange={(e) => setNewCandidate({...newCandidate, 'Native English (or above C1)': e.target.value})}><option value="No">No</option><option value="Yes">Yes</option><option value="N/A">N/A</option></select></div>
              <div><label style={{color: '#555', fontSize: '12px', fontWeight: 'bold'}}>Native Level Lang</label><br/><input style={inputStyle} type="text" value={newCandidate['Native level lang']} onChange={(e) => setNewCandidate({...newCandidate, 'Native level lang': e.target.value})} /></div>
              <div><label style={{color: '#555', fontSize: '12px', fontWeight: 'bold'}}>Good Level Lang.</label><br/><input style={inputStyle} type="text" value={newCandidate['Good level lang.']} onChange={(e) => setNewCandidate({...newCandidate, 'Good level lang.': e.target.value})} /></div>
              <div><label style={{color: '#555', fontSize: '12px', fontWeight: 'bold'}}>Position Applied For</label><br/><input style={inputStyle} type="text" value={newCandidate['Position applied for']} onChange={(e) => setNewCandidate({...newCandidate, 'Position applied for': e.target.value})} /></div>
              <div><label style={{color: '#555', fontSize: '12px', fontWeight: 'bold'}}>Basic Level Lang.</label><br/><input style={inputStyle} type="text" value={newCandidate['Basic level lang.']} onChange={(e) => setNewCandidate({...newCandidate, 'Basic level lang.': e.target.value})} /></div>
              <div>
                <label style={{color: '#555', fontSize: '12px', fontWeight: 'bold'}}>Contact Status (Email Answer)</label><br/>
                <select style={inputStyle} value={newCandidate['Email Answer']} onChange={(e) => setNewCandidate({...newCandidate, 'Email Answer': e.target.value})}>
                  <option value="">N/A</option>
                  <option value="No">No</option>
                  <option value="Yes-Awaiting Reply">Yes-Awaiting Reply</option>
                  <option value="Yes-Answered (Interested)">Yes-Answered (Interested)</option>
                  <option value="Yes-Answered (Not-interested)">Yes-Answered (Not-interested)</option>
                </select>
              </div>
              <div>
                <label style={{color: '#555', fontSize: '12px', fontWeight: 'bold'}}>Last Contact Date</label><br/>
                <input style={inputStyle} type="date" value={newCandidate['Last Contact Date']} onChange={(e) => setNewCandidate({...newCandidate, 'Last Contact Date': e.target.value})} />
              </div>
            </div>
            <div style={{ marginTop: '15px' }}><label style={{color: '#555', fontSize: '12px', fontWeight: 'bold'}}>Additional Comments & Notes</label><br/><textarea style={{...inputStyle, minHeight: '80px'}} value={newCandidate['Additional comments & notes from Katrium']} onChange={(e) => setNewCandidate({...newCandidate, 'Additional comments & notes from Katrium': e.target.value})} /></div>
            <button onClick={handleAddCandidate} style={{ marginTop: '20px', width: '100%', padding: '12px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}>Save New Candidate</button>
          </div>
        </div>
      )}

      {/* EDIT CANDIDATE MODAL */}
      {editingCandidate && (
        <div style={modalOverlayStyle}>
          <div style={modalBoxStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ddd', paddingBottom: '10px', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, color: katriumBlue }}>Edit: {editingCandidate.Name}</h2>
              <button onClick={() => setEditingCandidate(null)} style={{ padding: '5px 10px', cursor: 'pointer', backgroundColor: '#d9534f', color: 'white', border: 'none', borderRadius: '4px' }}>Close</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div><label style={{color: '#555', fontSize: '12px', fontWeight: 'bold'}}>Name *</label><br/><input style={inputStyle} type="text" value={editingCandidate.Name || ''} onChange={(e) => setEditingCandidate({...editingCandidate, Name: e.target.value})} /></div>
              <div><label style={{color: '#555', fontSize: '12px', fontWeight: 'bold'}}>Country *</label><br/><input style={inputStyle} type="text" value={editingCandidate.Country || ''} onChange={(e) => setEditingCandidate({...editingCandidate, Country: e.target.value})} /></div>
              <div><label style={{color: '#555', fontSize: '12px', fontWeight: 'bold'}}>Phone</label><br/><input style={inputStyle} type="text" value={editingCandidate.Phone || ''} onChange={(e) => setEditingCandidate({...editingCandidate, Phone: e.target.value})} /></div>
              <div><label style={{color: '#555', fontSize: '12px', fontWeight: 'bold'}}>Date of Application *</label><br/><input style={inputStyle} type="date" value={editingCandidate['Date of application'] || ''} onChange={(e) => setEditingCandidate({...editingCandidate, 'Date of application': e.target.value})} /></div>
              <div><label style={{color: '#555', fontSize: '12px', fontWeight: 'bold'}}>Email *</label><br/><input style={inputStyle} type="email" value={editingCandidate.Email || ''} onChange={(e) => setEditingCandidate({...editingCandidate, Email: e.target.value})} /></div>
              <div><label style={{color: '#555', fontSize: '12px', fontWeight: 'bold'}}>Gmail</label><br/><input style={inputStyle} type="email" value={editingCandidate.Gmail || ''} onChange={(e) => setEditingCandidate({...editingCandidate, Gmail: e.target.value})} /></div>
              <div><label style={{color: '#555', fontSize: '12px', fontWeight: 'bold'}}>Native Language *</label><br/><input style={inputStyle} type="text" value={editingCandidate['Native language'] || ''} onChange={(e) => setEditingCandidate({...editingCandidate, 'Native language': e.target.value})} /></div>
              <div><label style={{color: '#555', fontSize: '12px', fontWeight: 'bold'}}>Native English (C1+)</label><br/><select style={inputStyle} value={editingCandidate['Native English (or above C1)'] || 'No'} onChange={(e) => setEditingCandidate({...editingCandidate, 'Native English (or above C1)': e.target.value})}><option value="No">No</option><option value="Yes">Yes</option><option value="N/A">N/A</option></select></div>
              <div><label style={{color: '#555', fontSize: '12px', fontWeight: 'bold'}}>Native Level Lang</label><br/><input style={inputStyle} type="text" value={editingCandidate['Native level lang'] || ''} onChange={(e) => setEditingCandidate({...editingCandidate, 'Native level lang': e.target.value})} /></div>
              <div><label style={{color: '#555', fontSize: '12px', fontWeight: 'bold'}}>Good Level Lang.</label><br/><input style={inputStyle} type="text" value={editingCandidate['Good level lang.'] || ''} onChange={(e) => setEditingCandidate({...editingCandidate, 'Good level lang.': e.target.value})} /></div>
              <div><label style={{color: '#555', fontSize: '12px', fontWeight: 'bold'}}>Position Applied For</label><br/><input style={inputStyle} type="text" value={editingCandidate['Position applied for'] || ''} onChange={(e) => setEditingCandidate({...editingCandidate, 'Position applied for': e.target.value})} /></div>
              <div><label style={{color: '#555', fontSize: '12px', fontWeight: 'bold'}}>Basic Level Lang.</label><br/><input style={inputStyle} type="text" value={editingCandidate['Basic level lang.'] || ''} onChange={(e) => setEditingCandidate({...editingCandidate, 'Basic level lang.': e.target.value})} /></div>
              <div>
                <label style={{color: '#555', fontSize: '12px', fontWeight: 'bold'}}>Contact Status (Email Answer)</label><br/>
                <select style={inputStyle} value={editingCandidate['Email Answer'] || ''} onChange={(e) => setEditingCandidate({...editingCandidate, 'Email Answer': e.target.value})}>
                  <option value="">N/A</option>
                  <option value="No">No</option>
                  <option value="Yes-Awaiting Reply">Yes-Awaiting Reply</option>
                  <option value="Yes-Answered (Interested)">Yes-Answered (Interested)</option>
                  <option value="Yes-Answered (Not-interested)">Yes-Answered (Not-interested)</option>
                </select>
              </div>
              <div>
                <label style={{color: '#555', fontSize: '12px', fontWeight: 'bold'}}>Last Contact Date</label><br/>
                <input style={inputStyle} type="date" value={editingCandidate['Last Contact Date'] || ''} onChange={(e) => setEditingCandidate({...editingCandidate, 'Last Contact Date': e.target.value})} />
              </div>
            </div>
            <div style={{ marginTop: '15px' }}><label style={{color: '#555', fontSize: '12px', fontWeight: 'bold'}}>Additional Comments & Notes</label><br/><textarea style={{...inputStyle, minHeight: '80px'}} value={editingCandidate['Additional comments & notes from Katrium']} onChange={(e) => setEditingCandidate({...editingCandidate, 'Additional comments & notes from Katrium': e.target.value})} /></div>
            <button onClick={handleUpdateCandidate} style={{ marginTop: '20px', width: '100%', padding: '12px', backgroundColor: katriumBlue, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}>Save Changes</button>
          </div>
        </div>
      )}

      {/* VIEW CANDIDATE MODAL */}
      {selectedCandidate && (
        <div style={modalOverlayStyle}>
          <div style={modalBoxStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ddd', paddingBottom: '10px', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, color: katriumBlue }}>{selectedCandidate.Name}</h2>
              <button onClick={() => setSelectedCandidate(null)} style={{ padding: '5px 10px', cursor: 'pointer', backgroundColor: '#d9534f', color: 'white', border: 'none', borderRadius: '4px' }}>Close</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', lineHeight: '1.6', color: '#333' }}>
              <p style={{ margin: 0 }}><strong>Country:</strong> <br/>{selectedCandidate.Country || 'N/A'}</p>
              <p style={{ margin: 0 }}><strong>Date of Application:</strong> <br/>{formatDisplayDate(selectedCandidate['Date of application'])}</p>
              <p style={{ margin: 0 }}><strong>Phone:</strong> <br/>{selectedCandidate.Phone || 'N/A'}</p>
              <p style={{ margin: 0 }}><strong>Position Applied For:</strong> <br/>{selectedCandidate['Position applied for'] || 'N/A'}</p>
              <p style={{ margin: 0 }}><strong>Email:</strong> <br/>{selectedCandidate.Email || 'N/A'}</p>
              <p style={{ margin: 0 }}><strong>Gmail:</strong> <br/>{selectedCandidate.Gmail || 'N/A'}</p>
              <div style={{ gridColumn: 'span 2', marginTop: '10px', borderTop: '1px dashed #ddd', paddingTop: '10px' }}><h4 style={{ margin: '0 0 10px 0', color: '#555' }}>Language Proficiency</h4></div>
              <p style={{ margin: 0 }}><strong>Native Language:</strong> <br/>{selectedCandidate['Native language'] || 'N/A'}</p>
              <p style={{ margin: 0 }}><strong>Native English (C1+):</strong> <br/>{selectedCandidate['Native English (or above C1)'] || 'N/A'}</p>
              <p style={{ margin: 0 }}><strong>Native Level Lang:</strong> <br/>{selectedCandidate['Native level lang'] || 'N/A'}</p>
              <p style={{ margin: 0 }}><strong>Good Level Lang:</strong> <br/>{selectedCandidate['Good level lang.'] || 'N/A'}</p>
              <p style={{ margin: 0 }}><strong>Basic Level Lang:</strong> <br/>{selectedCandidate['Basic level lang.'] || 'N/A'}</p>
              <div style={{ gridColumn: 'span 2', marginTop: '10px', borderTop: '1px dashed #ddd', paddingTop: '10px' }}><h4 style={{ margin: '0 0 10px 0', color: '#555' }}>Contact Information</h4></div>
              <p style={{ margin: 0 }}><strong>Contact Status:</strong> <br/>{selectedCandidate['Email Answer'] || 'N/A'}</p>
              <p style={{ margin: 0, color: '#d9534f' }}><strong>Last Contact Date:</strong> <br/>{formatDisplayDate(selectedCandidate['Last Contact Date']) || 'Never'}</p>
            </div>
            <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid #ddd', lineHeight: '1.6', color: '#333' }}><p style={{ margin: '0 0 10px 0' }}><strong>Additional Comments & Notes:</strong> <br/>{selectedCandidate['Additional comments & notes from Katrium'] || 'None'}</p></div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;