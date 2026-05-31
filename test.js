const SUPABASE_URL = "https://izujreipvtsnldgpdynu.supabase.co"; 
        const SUPABASE_ANON_KEY = "sb_publishable_p7MUWJqXpImPGqkGEfbiow_EDC1iRK2"; 
        const LIFF_ID = "2010015310-qHlFgmRX";

        const API_URL = "https://script.google.com/macros/s/AKfycby6olYjXjpHDp5aVeE2BTzTC6vp34cgeaA4CAmUKr3om1kG-0d9dKcSbm3WaaYjBtVr/exec"; 
        
        async function callAPI(action, params = {}) {
            const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action, ...params }) });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        }

        const LIFF_ID_CONFIGURED = LIFF_ID !== 'YOUR_LIFF_ID_HERE';
        const db = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

        function appData() {
            return {
                darkMode: JSON.parse(localStorage.getItem('darkMode') || 'false'),
                currentPage: 'home', viewMode: 'grid', config: {}, positions: [], users: [], serverLogs: [],
                search: '', filterRegion: '', filterStatus: 'ALL', dashboardFilterRegion: 'ALL',
                adminTab: 'users', adminModalOpen: false, adminModalAction: 'CREATE', adminFormData: {id:'', name:'', code:'', region:''},
                isInitialLoading: true, loginCode: '',
                user: JSON.parse(localStorage.getItem('user_session') || '{"id": null, "pictureUrl": ""}'),
                wishlist: JSON.parse(localStorage.getItem('wishlist') || '[]'),
                showSlip: false, selectedSlipData: { posName: '', posRegion: '' },
                isSubmitting: false,
                searchQuery: '',
                lineLoading: false,
                lineProfile: {},
                lineBindModalOpen: false,
                lineBindStep: 1,
                lineBindCode: '',
                lineBindUserName: '',
                adminLoginMode: false,
                isFetching: false,
                _isFetchLocked: false, 
                _fetchTimeout: null,
                _pendingFetch: false,
                isDashboardFullscreen: false,
                fullscreenRegion: null,
                adminAssignModalOpen: false,
                adminAssignUserId: '',
                adminAssignPosId: '',
                posDetailModalOpen: false,
                selectedDetailPos: null,
                myTurnSheetOpen: false,
                _prevQueue: null,

                toggleDarkMode() { this.darkMode = !this.darkMode; localStorage.setItem('darkMode', this.darkMode); },
                
                get uniqueRegions() { 
                    const regions = [...new Set(this.positions.map(p => p[2]))].filter(Boolean);
                    return regions.sort((a, b) => {
                        if (a === 'บช.น.') return -1;
                        if (b === 'บช.น.') return 1;
                        const aIsPhak = a.startsWith('ภ.');
                        const bIsPhak = b.startsWith('ภ.');
                        if (aIsPhak && bIsPhak) return a.localeCompare(b);
                        if (aIsPhak) return -1;
                        if (bIsPhak) return 1;
                        return a.localeCompare(b);
                    });
                },

                get progressPercent() { return this.positions.length ? (this.positions.filter(p => p[3]!=='AVAILABLE').length/this.positions.length)*100 : 0; },
                getUserName(id) { const u = this.users.find(x => String(x[0]).trim() == String(id).trim()); return u ? u[1] : id; },
                get prev3Users() { const cur = parseInt(this.config.current_queue); return this.users.filter(u => parseInt(u[0]) < cur).sort((a,b) => parseInt(b[0]) - parseInt(a[0])).slice(0, 3).reverse(); },
                get next3Users() { const cur = parseInt(this.config.current_queue); return this.users.filter(u => parseInt(u[0]) > cur).sort((a,b) => parseInt(a[0]) - parseInt(b[0])).slice(0, 3); },
                get dashboardList() { return this.users.filter(u => String(u[3]).toUpperCase() === 'SELECTED').map(u => { const pos = this.positions.find(p => String(p[4]).trim() == String(u[0]).trim()); return { id: u[0], name: u[1], pos: u[4], region: pos ? pos[2] : '-', time: u[5] }; }).sort((a,b) => parseInt(a.id) - parseInt(b.id)); },
                
                getRegionStats(region) { 
                    let total = 0, taken = 0;
                    for (let i = 0; i < this.positions.length; i++) {
                        if (this.positions[i][2] === region) {
                            total++;
                            if (this.positions[i][3] !== 'AVAILABLE') taken++;
                        }
                    }
                    return { total, taken, percent: total ? (taken/total)*100 : 0 }; 
                },
                
                get regionDashboardStats() { const stats = {}; this.positions.forEach(p => { const r = p[2]; if(!stats[r]) stats[r] = { name: r, total: 0, taken: 0 }; stats[r].total++; if(p[3] !== 'AVAILABLE') stats[r].taken++; }); return Object.values(stats).map(s => ({...s, percent: (s.taken/s.total)*100})).sort((a,b) => a.name.localeCompare(b.name)); },
                
                isWishlist(id) { return this.wishlist.includes(id); },
                toggleWishlist(id) { 
                    if (this.wishlist.includes(id)) {
                        this.wishlist = this.wishlist.filter(w => w !== id); 
                    } else {
                        this.wishlist.push(id); 
                        this.wishlist = [...this.wishlist]; 
                    }
                    localStorage.setItem('wishlist', JSON.stringify(this.wishlist)); 
                },

                get availablePositions() {
                    return this.positions
                        .filter(p => p[3] === 'AVAILABLE')
                        .sort((a, b) => a[2].localeCompare(b[2]) || a[1].localeCompare(b[1]));
                },
                
                get wishlistAvailable() {
                    return this.positions
                        .filter(p => p[3] === 'AVAILABLE' && this.wishlist.includes(p[0]))
                        .sort((a, b) => a[2].localeCompare(b[2]) || a[1].localeCompare(b[1]));
                },
                
                get groupedPositions() {
                    let filtered = this.positions.filter(p => {
                        const matchesSearch = p[1].toLowerCase().includes(this.search.toLowerCase()) || (p[2] && p[2].toLowerCase().includes(this.search.toLowerCase()));
                        const matchesRegion = this.filterRegion === '' || p[2] === this.filterRegion;
                        let matchesStatus = true;
                        if (this.filterStatus === 'AVAILABLE') matchesStatus = p[3] === 'AVAILABLE';
                        if (this.filterStatus === 'TAKEN') matchesStatus = p[3] !== 'AVAILABLE';
                        if (this.filterStatus === 'WISHLIST') matchesStatus = this.wishlist.includes(p[0]);
                        return matchesSearch && matchesRegion && matchesStatus;
                    });
                    filtered.sort((a, b) => { if (a[3] === 'AVAILABLE' && b[3] !== 'AVAILABLE') return -1; if (a[3] !== 'AVAILABLE' && b[3] === 'AVAILABLE') return 1; if (a[2] !== b[2]) return a[2].localeCompare(b[2]); return a[1].localeCompare(b[1]); });
                    const groups = {}; filtered.forEach(p => { if (!groups[p[2]]) groups[p[2]] = []; groups[p[2]].push(p); });
                    return Object.keys(groups).sort().map(region => ({ name: region, items: groups[region] }));
                },

                get isMyTurn() {
                    if (!this.user || !this.user.id || this.user.role !== 'USER') return false;
                    const myId = Number(this.user.id);
                    const currentQ = Number(this.config.current_queue);
                    if (!myId || !currentQ || isNaN(myId) || isNaN(currentQ)) return false;
                    
                    const rawStatus = this.config.system_status;
                    const systemOpen = !rawStatus || String(rawStatus).trim().toUpperCase() === 'OPEN';
                    
                    const rawUserStatus = this.user.status || 'WAITING';
                    const notYetSelected = String(rawUserStatus).trim().toUpperCase() !== 'SELECTED';
                    
                    return myId === currentQ && systemOpen && notYetSelected;
                },

                get nextUser() { const nextId = parseInt(this.config.current_queue) + 1; const u = this.users.find(u => parseInt(u[0]) === nextId); return u ? {id: u[0], name: u[1]} : null; },
                get prevUser() { const prevId = parseInt(this.config.current_queue) - 1; const u = this.users.find(u => parseInt(u[0]) === prevId); return u ? {id: u[0], name: u[1]} : null; },
                get currentUserObj() { const currId = parseInt(this.config.current_queue); const u = this.users.find(u => parseInt(u[0]) === currId); return u ? {id: u[0], name: u[1]} : null; },

                toggleDashboardFullscreen() {
                    this.isDashboardFullscreen = !this.isDashboardFullscreen;
                    if (this.isDashboardFullscreen) document.body.classList.add('overflow-hidden');
                    else document.body.classList.remove('overflow-hidden');
                },
                getPositionsByRegion(region) {
                    return this.positions.filter(p => p[2] === region).sort((a, b) => a[1].localeCompare(b[1]));
                },
                getRegionColorClass(region) {
                    const map = { 'บช.น.': 'bg-blue-600', 'ภ.1': 'bg-red-600', 'ภ.2': 'bg-orange-500', 'ภ.3': 'bg-green-600', 'ภ.4': 'bg-gradient-to-r from-purple-600 to-fuchsia-600', 'ภ.5': 'bg-pink-600', 'ภ.6': 'bg-teal-600', 'ภ.7': 'bg-yellow-600', 'ภ.8': 'bg-indigo-600', 'ภ.9': 'bg-cyan-600', 'ตชด.': 'bg-emerald-700', 'สพฐ.ตร.': 'bg-slate-700', 'บช.ก.': 'bg-yellow-700' };
                    return map[region] || 'bg-slate-700';
                },

                getRegionBarColor(region) {
                    const map = {
                        'บช.น.': '#2563eb',
                        'ภ.1':   '#dc2626',
                        'ภ.2':   '#f97316',
                        'ภ.3':   '#16a34a',
                        'ภ.4':   '#9333ea',
                        'ภ.5':   '#ec4899',
                        'ภ.6':   '#0d9488',
                        'ภ.7':   '#ca8a04',
                        'ภ.8':   '#4f46e5',
                        'ภ.9':   '#0891b2',
                        'ตชด.':  '#059669',
                        'สพฐ.ตร.': '#475569',
                        'บช.ก.': '#a16207'
                    };
                    return map[region] || '#2563eb';
                },
                
                openPosDetail(pos) {
                    this.selectedDetailPos = pos;
                    this.posDetailModalOpen = true;
                    setTimeout(() => { if(window.lucide) window.lucide.createIcons(); }, 50);
                },

                initApp() {
                    this.fetchData();
                    this.initRealtime();
                    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.fetchData(); });
                    this.initLiff();
                    setInterval(() => { if (!document.hidden) this.fetchData(); }, 60000);
                },

                showToast(message, type = 'info', duration = 3500) {
                    const container = document.getElementById('toast-container');
                    if (!container) return;
                    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
                    const toast = document.createElement('div');
                    toast.className = 'toast toast-' + type;
                    toast.innerHTML = '<span style="font-size:16px;flex-shrink:0">' + (icons[type] || 'ℹ️') + '</span><span style="flex:1">' + message + '</span>';
                    container.appendChild(toast);
                    setTimeout(() => {
                        toast.classList.add('toast-exit');
                        setTimeout(() => { if(toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
                    }, duration);
                },

                triggerMyTurn() {
                    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 300]);
                    this.myTurnSheetOpen = true;
                    this.showToast('🔔 ถึงคิวของคุณแล้ว! กรุณาเลือกตำแหน่ง', 'success', 5000);
                    if (this.currentPage !== 'home') this.switchPage('home');
                    else window.scrollTo({ top: 0, behavior: 'smooth' });
                },

                async sendGroupNotification(pos) {
                    if (!window.liff || !liff.isLoggedIn() || liff.getContext().type === "none") {
                        console.log("ไม่ได้เปิด LIFF ผ่านห้องแชท ข้ามการส่งข้อความ");
                        return;
                    }

                    const currentQ = parseInt(this.config.current_queue);
                    const nextU = this.users.find(u => parseInt(u[0]) === currentQ);

                    const nextName = nextU ? nextU[1] : "ไม่ระบุชื่อ";
                    const nextLineId = nextU ? nextU[6] : null; 

                    const userPicUrl = this.user.pictureUrl || "https://cdn-icons-png.flaticon.com/512/847/847969.png";
                    const format = String(this.config.flex_format || localStorage.getItem('flex_format') || '1');
                    
                    let messages = [];

                    if (format === '1') {
                        // รูปแบบ 1: แสดงสถานที่ที่เลือก + แยกข้อมูลคิวถัดไปใน Flex กล่องที่ 2
                        messages.push({
                            type: "flex",
                            altText: `อัปเดต: คิวที่ ${this.user.id} เลือกตำแหน่งแล้ว`,
                            contents: {
                                type: "bubble",
                                size: "mega",
                                body: {
                                    type: "box",
                                    layout: "vertical",
                                    paddingAll: "md",
                                    contents: [
                                        {
                                            type: "box",
                                            layout: "horizontal",
                                            spacing: "md",
                                            alignItems: "center",
                                            contents: [
                                                {
                                                    type: "box", layout: "vertical", width: "45px", height: "45px", cornerRadius: "100px",
                                                    contents: [{ type: "image", url: userPicUrl, size: "full", aspectMode: "cover", aspectRatio: "1:1" }]
                                                },
                                                {
                                                    type: "box", layout: "vertical",
                                                    contents: [
                                                        { type: "text", text: `ลำดับคิวที่ ${this.user.id}`, size: "xs", color: "#42659c", weight: "bold" },
                                                        { type: "text", text: `${this.user.name}`, size: "sm", weight: "bold", wrap: true },
                                                        { type: "text", text: "RPCA 79 - SELECTION", size: "xxs", color: "#aaaaaa", margin: "none" }
                                                    ]
                                                }
                                            ]
                                        },
                                        {
                                            type: "box",
                                            layout: "vertical",
                                            margin: "md",
                                            backgroundColor: "#f4f6f8",
                                            cornerRadius: "md",
                                            paddingAll: "sm",
                                            spacing: "xs",
                                            contents: [
                                                { type: "text", text: "ตำแหน่งที่เลือก (Selected)", size: "xxs", color: "#8c8c8c" },
                                                { type: "text", text: `${pos[1]}`, size: "sm", weight: "bold", color: "#111111" },
                                                { type: "text", text: `📍 สังกัด: ${pos[2]}`, size: "xs", color: "#42659c" }
                                            ]
                                        }
                                    ]
                                }
                            }
                        });

                    } else {
                        // รูปแบบ 2: ซ่อนสถานที่ + แจ้งแค่คิวถัดไป
                        messages.push({
                            type: "flex",
                            altText: `อัปเดตสถานะการเลือกตำแหน่ง`,
                            contents: {
                                type: "bubble",
                                size: "mega",
                                body: {
                                    type: "box",
                                    layout: "vertical",
                                    paddingAll: "md",
                                    contents: [
                                        {
                                            type: "box",
                                            layout: "vertical",
                                            alignItems: "center",
                                            margin: "sm",
                                            contents: [
                                                { type: "text", text: "✅ เสร็จสิ้นการเลือกตำแหน่ง", size: "sm", color: "#10b981", weight: "bold" },
                                                { type: "text", text: `คิวที่ ${this.user.id}`, size: "xl", weight: "bold", margin: "sm", color: "#1e293b" },
                                                { type: "text", text: `${this.user.name}`, size: "xs", color: "#64748b" }
                                            ]
                                        },
                                        { type: "separator", margin: "md" },
                                        {
                                            type: "box",
                                            layout: "vertical",
                                            margin: "md",
                                            backgroundColor: "#fff1f2",
                                            cornerRadius: "md",
                                            paddingAll: "sm",
                                            contents: [
                                                { type: "text", text: "👉 ลำดับต่อไป (Next Queue)", size: "xs", color: "#e11d48", weight: "bold" },
                                                { type: "text", text: `คิวที่ ${currentQ} : ${nextName}`, size: "sm", weight: "bold", wrap: true, margin: "xs", color: "#881337" }
                                            ]
                                        }
                                    ]
                                }
                            }
                        });
                    }
                    
                    try {
                        await liff.sendMessages(messages);
                        this.showToast('ส่งแจ้งเตือนเข้ากลุ่มสำเร็จ', 'success');
                    } catch (err) {
                        console.error("LIFF Send Messages Error: ", err);
                    }
                },

                confirmSelect(pos) {
                    Swal.fire({ title: 'ยืนยันเลือก?', text: pos[1] + ' (' + pos[2] + ')', icon: 'question', showCancelButton: true, confirmButtonColor: '#2563eb', confirmButtonText: 'ยืนยัน', cancelButtonText: 'ยกเลิก' }).then(async (result) => {
                        if (result.isConfirmed) {
                            if (this.isSubmitting) return;
                            if (!this.isMyTurn) {
                                Swal.fire('หมดสิทธิ์', 'ไม่ใช่คิวของคุณหรือระบบปิดอยู่', 'warning');
                                return;
                            }
                            const currentPos = this.positions.find(p => p[0] == pos[0]);
                            if (!currentPos || currentPos[3] !== 'AVAILABLE') {
                                Swal.fire('เสียใจด้วย', 'ตำแหน่งนี้ถูกเลือกไปแล้ว', 'error');
                                return;
                            }
                            this.isSubmitting = true;
                            Swal.fire({title: 'Saving...', didOpen:()=>Swal.showLoading()});
                            try {
                                const { data, error } = await db.rpc('select_position', { p_user_id: parseInt(this.user.id), p_pos_id: String(pos[0]) });
                                if (error) throw error;
                                this.isSubmitting = false;
                                if(data.status === 'SUCCESS') {
                                    this.config = { ...this.config, current_queue: parseInt(this.config.current_queue) + 1 };
                                    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#2563eb', '#22c55e', '#fbbf24'] });
                                    this.selectedSlipData = { posName: pos[1], posRegion: pos[2] };
                                    this.showSlip = true; 
                                    Swal.close(); 
                                    this.switchPage('dashboard'); 
                                    this.fetchData(); 
                                    this.sendGroupNotification(pos);
                                } else { 
                                    Swal.fire('ไม่สำเร็จ', data.msg || 'กรุณาลองใหม่', 'error');
                                    this.fetchData();
                                }
                            } catch(e) { 
                                this.isSubmitting = false;
                                console.error('[RPCA79] confirmSelect error:', e);
                                Swal.fire('Error', 'เกิดข้อผิดพลาด กรุณาลองใหม่', 'error');
                                this.fetchData();
                            }
                        }
                    });
                },

                // NEW: ฟังก์ชันบันทึกการตั้งค่ารูปแบบการแจ้งเตือน
                async saveFlexFormat() {
                    try {
                        const format = this.config.flex_format || '1';
                        const { error } = await db.from('config').update({ flex_format: format }).eq('id', 1);
                        if (error) {
                            console.warn('Column flex_format does not exist in config table. Storing in localStorage instead.');
                            localStorage.setItem('flex_format', format);
                            this.showToast('บันทึกในเครื่องของคุณแล้ว (กรุณาเพิ่ม Column ใน DB หากต้องการให้ครอบคลุมทุกคน)', 'warning', 5000);
                        } else {
                            this.showToast('บันทึกรูปแบบการแจ้งเตือนเรียบร้อยแล้ว', 'success');
                        }
                    } catch(e) {
                        console.error('saveFlexFormat Error:', e);
                    }
                },

                initRealtime() {
                    if (!db) return;
                    const debouncedFetch = () => {
                        clearTimeout(this._fetchTimeout);
                        this._fetchTimeout = setTimeout(() => { this.fetchData(); }, 500);
                    };
                    
                    db.channel('public-db-changes')
                        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'positions' }, payload => {
                            if (payload.new) {
                                const updatedPos = payload.new;
                                const index = this.positions.findIndex(p => p[0] == updatedPos.id);
                                if (index !== -1) {
                                    const newPosArray = [...this.positions[index]];
                                    newPosArray[3] = updatedPos.status;
                                    newPosArray[4] = updatedPos.taken_by_user_id;
                                    this.positions.splice(index, 1, newPosArray);
                                    this.positions = [...this.positions];
                                }
                            }
                        })
                        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'positions' }, () => { debouncedFetch(); })
                        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'positions' }, () => { debouncedFetch(); })
                        
                        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'config' }, payload => {
                            const oldQueue = this.config.current_queue;
                            if (payload.new) {
                                this.config = { ...this.config, ...payload.new };
                            }
                            if (parseInt(this.user.id) === payload.new.current_queue && oldQueue !== payload.new.current_queue) {
                                if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
                            }
                        })

                        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users' }, payload => {
                             if (payload.new) {
                                 const updatedUser = payload.new;
                                 const index = this.users.findIndex(u => u[0] == updatedUser.id);
                                 if(index !== -1) {
                                     const newUserArray = [...this.users[index]];
                                     newUserArray[3] = updatedUser.status;
                                     newUserArray[4] = updatedUser.selected_pos_name;
                                     newUserArray[5] = updatedUser.selected_at;
                                     newUserArray[6] = updatedUser.line_user_id;
                                     newUserArray[7] = updatedUser.line_display_name;
                                     this.users.splice(index, 1, newUserArray);
                                     this.users = [...this.users];
                                 }
                                 
                                 if (this.user && this.user.role === 'USER' && String(this.user.id) === String(updatedUser.id)) {
                                     this.user = {
                                         ...this.user,
                                         status: updatedUser.status,
                                         selectedPosName: updatedUser.selected_pos_name,
                                         selectedAt: updatedUser.selected_at
                                     };
                                     localStorage.setItem('user_session', JSON.stringify(this.user));
                                 }
                             }
                        })

                        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'logs' }, payload => {
                            if (payload.new) {
                                const l = payload.new;
                                this.serverLogs.unshift([l.created_at, l.user_id, l.user_name, l.pos_id, l.pos_name, l.pos_region]);
                                if (this.serverLogs.length > 50) this.serverLogs.pop();
                                this.serverLogs = [...this.serverLogs];
                            }
                        })
                        
                        .subscribe((status) => {
                            if (status === 'SUBSCRIBED') {
                                this.connectionError = false;
                            } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                                this.connectionError = true;
                                setTimeout(() => { 
                                    db.removeAllChannels(); 
                                    this.initRealtime(); 
                                    this.fetchData(); 
                                }, 5000); 
                            }
                        });
                },

                async fetchData() {
                    if (!db) return;
                    if (this._isFetchLocked) {
                        this._pendingFetch = true;
                        return; 
                    }
                    this._isFetchLocked = true;
                    this._pendingFetch = false;
                    this.isFetching = true;
                    try {
                        const [configRes, usersRes, posRes, logsRes] = await Promise.all([
                            db.from('config').select('*').eq('id', 1).single(),
                            db.from('users').select('*').order('id', { ascending: true }),
                            db.from('positions').select('*'),
                            db.from('logs').select('*').order('created_at', { ascending: false }).limit(5)
                        ]);
                        
                        if (configRes.data) {
                            this.config = { ...configRes.data };
                            if (!this.config.flex_format) {
                                this.config.flex_format = localStorage.getItem('flex_format') || '1';
                            }
                        }
                        if (posRes.data) this.positions = posRes.data.map(p => [p.id, p.name, p.region, p.status, p.taken_by_user_id]);
                        if (usersRes.data) this.users = usersRes.data.map(u => [u.id, u.name, u.code, u.status, u.selected_pos_name, u.selected_at, u.line_user_id, u.line_display_name]);
                        if (logsRes.data) this.serverLogs = logsRes.data.map(l => [l.created_at, l.user_id, l.user_name, l.pos_id, l.pos_name, l.pos_region]);
                        this.isInitialLoading = false;
                        this.connectionError = false;
                        
                        if(this.user.id && this.user.role === 'USER') {
                            const u = this.users.find(x => String(x[0]).trim() == String(this.user.id).trim());
                            if(u) {
                                const selectedPos = this.positions.find(p => String(p[4]).trim() == String(u[0]).trim());
                                this.user = {
                                    ...this.user,
                                    status: String(u[3] || 'WAITING').trim(),
                                    name: u[1] || this.user.name,
                                    lineLinked: !!u[6],
                                    lineDisplayName: u[7] || this.lineProfile?.displayName || null,
                                    selectedPosName: u[4] || null,
                                    selectedAt: u[5] || null,
                                    selectedRegion: selectedPos ? selectedPos[2] : null
                                };
                                localStorage.setItem('user_session', JSON.stringify(this.user));
                            }
                        }
                    } catch(e) {
                        this.isInitialLoading = false;
                        this.connectionError = true;
                        console.error('[RPCA79] fetchData error:', e);
                    } finally {
                        this._isFetchLocked = false;
                        setTimeout(() => this.isFetching = false, 500);
                        if (this._pendingFetch) {
                            this._pendingFetch = false;
                            setTimeout(() => this.fetchData(), 100);
                        }
                    }
                },

                switchPage(page) { this.currentPage = page; window.scrollTo({top:0, behavior:'smooth'}); },

                async login() {
                    if(!this.loginCode) return;
                    try {
                        const { data: configData } = await db.from('config').select('admin_pass').eq('id', 1).single();
                        if(String(this.loginCode).trim() == String(configData.admin_pass).trim()) {
                            this.user = { role: 'ADMIN', id: 'ADMIN', name: 'Administrator', status: 'SYSTEM', pictureUrl: null };
                            localStorage.setItem('user_session', JSON.stringify(this.user));
                            this.switchPage('admin_panel');
                            return;
                        }
                        const { data: userData, error } = await db.from('users').select('*').eq('code', String(this.loginCode).trim()).single();
                        if(error || !userData) { Swal.fire('Error', 'ไม่พบรหัสประจำตัวนี้', 'error'); } 
                        else { 
                            this.user = { role: 'USER', id: userData.id, name: userData.name, status: userData.status, lineLinked: !!userData.line_user_id, lineDisplayName: userData.line_display_name || null, pictureUrl: null }; 
                            localStorage.setItem('user_session', JSON.stringify(this.user)); 
                            this.switchPage('home'); 
                        }
                    } catch(e) { Swal.fire('Error', 'เกิดข้อผิดพลาด', 'error'); }
                },

                logout() { this.user = {id: null, pictureUrl: null}; localStorage.removeItem('user_session'); this.lineProfile = {}; this.switchPage('login'); },

                adminAction(action) {
                    Swal.fire({title: 'Confirm?', text: action, icon: 'warning', showCancelButton: true}).then(async r => {
                        if(r.isConfirmed) {
                            Swal.fire({title: 'Processing...', didOpen:()=>Swal.showLoading()});
                            try { 
                                if (action === 'BACKUP') {
                                    Swal.fire('Info', 'การ Backup ระบบของ Supabase จะทำให้อัตโนมัติในระบบหลังบ้านครับ', 'info'); return;
                                }
                                const { error } = await db.rpc('exec_admin_action', { p_action: action });
                                if (error) throw error;
                                
                                Swal.close(); this.fetchData(); 
                            } catch(e) { Swal.fire('Error', 'เกิดข้อผิดพลาด: ' + e.message, 'error'); }
                        }
                    });
                },
                adminReset() { this.adminAction('RESET'); },
                triggerBackup() { this.adminAction('BACKUP'); },

                openAdminModal(action, data = null, type = 'USER') {
                    this.adminModalAction = action; this.adminModalOpen = true;
                    if(action === 'CREATE') this.adminFormData = {id:'', name:'', code:'', region:''};
                    else this.adminFormData = type === 'USER' ? {id: data[0], name: data[1], code: data[2], region:''} : {id: data[0], name: data[1], region: data[2], code:''};
                },

                async saveAdminData() {
                    const type = this.adminTab === 'users' ? 'USER' : 'POSITION';
                    Swal.fire({title: 'Saving...', didOpen:()=>Swal.showLoading()});
                    try { 
                        let error = null;
                        if (type === 'USER') {
                            const { error: err } = await db.rpc('admin_manage_user', { 
                                p_action: this.adminModalAction, 
                                p_id: parseInt(this.adminFormData.id), 
                                p_name: this.adminFormData.name, 
                                p_code: this.adminFormData.code 
                            });
                            error = err;
                        } else {
                            const { error: err } = await db.rpc('admin_manage_position', { 
                                p_action: this.adminModalAction, 
                                p_id: String(this.adminFormData.id), 
                                p_name: this.adminFormData.name, 
                                p_region: this.adminFormData.region 
                            });
                            error = err;
                        }
                        if (error) throw error;
                        
                        this.adminModalOpen = false; 
                        Swal.close();
                        this.fetchData(); 
                    } catch(e) { Swal.fire('Error', 'เกิดข้อผิดพลาด: ' + e.message, 'error'); }
                },

                deleteAdminData(id, type) {
                    Swal.fire({title: 'Delete?', icon:'error', showCancelButton:true}).then(async r => {
                        if(r.isConfirmed) { 
                            Swal.fire({title: 'Deleting...', didOpen:()=>Swal.showLoading()});
                            try { 
                                let error = null;
                                if (type === 'USER') {
                                    const { error: err } = await db.rpc('admin_manage_user', { p_action: 'DELETE', p_id: parseInt(id), p_name: '', p_code: '' });
                                    error = err;
                                } else {
                                    const { error: err } = await db.rpc('admin_manage_position', { p_action: 'DELETE', p_id: String(id), p_name: '', p_region: '' });
                                    error = err;
                                }
                                if (error) throw error;
                                
                                Swal.close();
                                this.fetchData(); 
                            } catch(e) { Swal.fire('Error', 'เกิดข้อผิดพลาด: ' + e.message, 'error'); } 
                        }
                    });
                },

                async unlinkUserLine(userId, userName) {
                    Swal.fire({
                        title: 'รีเซ็ตบัญชี LINE?',
                        text: `ต้องการยกเลิกการเชื่อมต่อ LINE ของ ${userName} ใช่หรือไม่?`,
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonColor: '#2563eb',
                        cancelButtonColor: '#cbd5e1',
                        confirmButtonText: 'ยืนยันรีเซ็ต',
                        cancelButtonText: 'ยกเลิก'
                    }).then(async r => {
                        if(r.isConfirmed) {
                            Swal.fire({title: 'กำลังดำเนินการ...', didOpen:()=>Swal.showLoading()});
                            try {
                                const { error } = await db.from('users').update({ line_user_id: null, line_display_name: null }).eq('id', parseInt(userId));
                                if(error) throw error;
                                Swal.fire('สำเร็จ', 'รีเซ็ตบัญชี LINE ของผู้ใช้นี้เรียบร้อยแล้ว', 'success');
                                this.fetchData();
                            } catch(e) {
                                Swal.fire('Error', 'เกิดข้อผิดพลาด: ' + e.message, 'error');
                            }
                        }
                    });
                },

                async submitAdminAssign() {
                    if(!this.adminAssignUserId || !this.adminAssignPosId) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกผู้ใช้งานและตำแหน่งให้ครบถ้วน', 'warning');
                    Swal.fire({title: 'กำลังบันทึกข้อมูล...', didOpen:()=>Swal.showLoading()});
                    try {
                        const { error } = await db.rpc('admin_assign_position', {
                            p_user_id: parseInt(this.adminAssignUserId),
                            p_pos_id: String(this.adminAssignPosId)
                        });
                        if (error) throw error;
                        
                        this.adminAssignModalOpen = false;
                        this.adminAssignUserId = '';
                        this.adminAssignPosId = '';
                        Swal.fire('สำเร็จ', 'บันทึกการเลือกตำแหน่งแทนเรียบร้อยแล้ว', 'success');
                        this.fetchData();
                    } catch(e) { Swal.fire('Error', 'เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + e.message, 'error'); }
                },

                formatTime(dateStr) {
                    if(!dateStr) return '-';
                    const s = String(dateStr).trim();
                    if(s.match(/^\d{1,2}:\d{2}/)) return s.substring(0, 5);
                    const converted = s.replace(/(\d{1,2})\/(\d{1,2})\/(\d{4})/, function(_, d, m, y) {
                        const year = parseInt(y) > 2400 ? parseInt(y) - 543 : y;
                        return m + '/' + d + '/' + year;
                    });
                    try { 
                        let d = new Date(converted); 
                        if (isNaN(d.getTime())) d = new Date(new Date().toDateString() + ' ' + s); 
                        return isNaN(d.getTime()) ? s : d.toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'}); 
                    } catch(e) { 
                        return s; 
                    }
                },

                async initLiff() {
                    if (!LIFF_ID_CONFIGURED) return;
                    try {
                        await liff.init({ liffId: LIFF_ID });
                        if (liff.isLoggedIn()) {
                            this.lineProfile = await liff.getProfile();
                            const saved = JSON.parse(localStorage.getItem('user_session') || '{"id":null}');
                            if (!saved.id) {
                                try { 
                                    const { data: res } = await db.from('users').select('*').eq('line_user_id', String(this.lineProfile.userId)).single();
                                    if (res) { 
                                        this.user = { role: 'USER', id: res.id, name: res.name, status: res.status, lineLinked: true, lineDisplayName: res.line_display_name || this.lineProfile.displayName, pictureUrl: this.lineProfile.pictureUrl }; 
                                        localStorage.setItem('user_session', JSON.stringify(this.user)); this.switchPage('home'); 
                                    } 
                                } catch(e) {}
                            }
                        }
                    } catch(e) { console.warn('LIFF init skipped:', e.message); }
                },
                
                async loginWithLine() {
                    if (!LIFF_ID_CONFIGURED) { Swal.fire('แจ้งเตือน', 'กรุณาตั้งค่า LIFF_ID ก่อนใช้งาน', 'warning'); return; }
                    this.lineLoading = true;
                    try {
                        await liff.init({ liffId: LIFF_ID });
                        if (!liff.isLoggedIn()) { liff.login({ redirectUri: window.location.href }); return; }
                        this.lineProfile = await liff.getProfile();
                        const { data: res, error } = await db.from('users').select('*').eq('line_user_id', String(this.lineProfile.userId)).single();
                        this.lineLoading = false;
                        if (res) { 
                            this.user = { role: 'USER', id: res.id, name: res.name, status: res.status, lineLinked: true, lineDisplayName: res.line_display_name || this.lineProfile.displayName, pictureUrl: this.lineProfile.pictureUrl }; 
                            localStorage.setItem('user_session', JSON.stringify(this.user)); this.switchPage('home'); 
                        } else { this.openLineBindModal(); }
                    } catch(e) { this.lineLoading = false; Swal.fire('Error', 'ไม่สามารถเชื่อมต่อ LINE ได้', 'error'); }
                },
                
                openLineBindModal() {
                    this.lineBindModalOpen = true;
                    if (this.user.id && this.lineProfile && this.lineProfile.userId) { this.lineBindUserName = this.user.name; this.lineBindStep = 2; }
                    else { this.lineBindStep = 1; this.lineBindCode = ''; }
                },
                
                async proceedLineStep1() {
                    if (!this.lineBindCode) return;
                    this.lineLoading = true;
                    try {
                        const { data: res, error } = await db.from('users').select('*').eq('code', String(this.lineBindCode).trim()).single();
                        this.lineLoading = false;
                        if (error || !res) { Swal.fire('ไม่พบรหัส', 'โปรดตรวจสอบรหัสประจำตัว', 'error'); }
                        else if (res.line_user_id && res.line_user_id !== this.lineProfile?.userId) {
                            Swal.fire('เกิดข้อผิดพลาด', 'รหัสประจำตัวนี้ถูกผูกกับบัญชี LINE อื่นไปแล้ว (ติดต่อแอดมินหากต้องการรีเซ็ต)', 'error');
                        }
                        else { this.lineBindUserName = res.name; this._pendingBindUser = res; this.lineBindStep = 2; }
                    } catch(e) { this.lineLoading = false; }
                },
                
                async confirmLineBind() {
                    this.lineLoading = true;
                    const userId = this.user.id || (this._pendingBindUser && this._pendingBindUser.id);
                    const lineUserId = this.lineProfile?.userId;
                    const lineDisplayName = this.lineProfile?.displayName;
                    if (!userId || !lineUserId) { this.lineLoading = false; Swal.fire('Error', 'ข้อมูลไม่ครบถ้วน', 'error'); return; }
                    
                    try {
                        // Double check before saving
                        const { data: checkUser } = await db.from('users').select('line_user_id').eq('id', parseInt(userId)).single();
                        if (checkUser && checkUser.line_user_id && checkUser.line_user_id !== lineUserId) {
                            this.lineLoading = false;
                            Swal.fire('เกิดข้อผิดพลาด', 'บัญชีนี้ถูกผูกกับ LINE อื่นไปแล้ว', 'error');
                            return;
                        }

                        const { error } = await db.from('users').update({ line_user_id: lineUserId, line_display_name: lineDisplayName }).eq('id', parseInt(userId));
                        this.lineLoading = false;
                        if (!error) {
                            this.lineBindStep = 3; this.user.lineLinked = true; this.user.lineUserId = lineUserId; this.user.lineDisplayName = lineDisplayName; this.user.pictureUrl = this.lineProfile.pictureUrl;
                            if (this._pendingBindUser) { this.user = { ...this._pendingBindUser, lineLinked: true, lineUserId: lineUserId, lineDisplayName: lineDisplayName, pictureUrl: this.lineProfile.pictureUrl }; this._pendingBindUser = null; }
                            localStorage.setItem('user_session', JSON.stringify(this.user));
                        } else { Swal.fire('Error', 'ไม่สามารถเชื่อมต่อ LINE ได้', 'error'); }
                    } catch(e) { this.lineLoading = false; Swal.fire('Error', 'เกิดข้อผิดพลาด', 'error'); }
                }
            }
        }

        document.addEventListener('DOMContentLoaded', () => {
            if (window.lucide) {
                lucide.createIcons();
                let timeout = null;
                const observer = new MutationObserver((mutations) => {
                    let shouldUpdate = false;
                    for (let m of mutations) {
                        if (m.type === 'childList') {
                            for (let node of m.addedNodes) {
                                if (node.nodeType === 1 && node.tagName.toLowerCase() !== 'svg') {
                                    if (node.hasAttribute('data-lucide') || node.querySelector('[data-lucide]')) {
                                        shouldUpdate = true; break;
                                    }
                                }
                            }
                        }
                        if (shouldUpdate) break;
                    }
                    if (shouldUpdate) {
                        clearTimeout(timeout);
                        timeout = setTimeout(() => { requestAnimationFrame(() => { lucide.createIcons(); }); }, 20);
                    }
                });
                observer.observe(document.body, { childList: true, subtree: true });
            }
        });
    
