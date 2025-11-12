// ==================== NAVIGATION ====================
function showSection(sectionName) {
    // Hide all sections
    const sections = document.querySelectorAll('.section');
    sections.forEach(section => section.classList.remove('active'));
    
    // Remove active from nav items
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => item.classList.remove('active'));
    
    // Show selected section
    document.getElementById(sectionName).classList.add('active');
    
    // Activate nav item
    navItems.forEach(button => {
        if (button.onclick && button.onclick.toString().includes(sectionName)) {
            button.classList.add('active');
        }
    });
    
    // Update page title
    const titles = {
        dashboard: 'Dashboard',
        cars: 'Cars',
        rentals: 'Rentals',
        warehouse: 'Warehouse',
        pos: 'Point of Sale',
        admin: 'Admin Panel'
    };
    document.getElementById('pageTitle').textContent = titles[sectionName];

    // Initialize module
    switch(sectionName) {
        case 'dashboard':
            Dashboard.init();
            break;
        case 'cars':
            Cars.init();
            break;
        case 'rentals':
            Rentals.init();
            break;
        case 'warehouse':
            Warehouse.init();
            break;
        case 'pos':
            POS.init();
            break;
        case 'admin':
            Admin.init();
            break;
    }
}

// ==================== AUTO-REFRESH DASHBOARD ====================
setInterval(() => {
    const dashboardSection = document.getElementById('dashboard');
    if (dashboardSection && dashboardSection.classList.contains('active')) {
        Dashboard.load();
    }
}, 30000); // Every 30 seconds
