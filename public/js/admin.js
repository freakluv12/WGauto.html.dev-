const Admin = {
    users: [],

    init() {
        if (!Auth.currentUser || Auth.currentUser.role !== 'ADMIN') {
            document.querySelector('#usersTable tbody').innerHTML = 
                '<tr><td colspan="5">Access denied</td></tr>';
            return;
        }
        this.loadUsers();
    },

    async loadUsers() {
        try {
            const response = await API.call('/api/admin/users');
            if (!response) return;

            this.users = await response.json();
            this.renderUsers();
        } catch (error) {
            console.error('Load users error:', error);
            document.querySelector('#usersTable tbody').innerHTML = 
                '<tr><td colspan="5">Error loading users</td></tr>';
        }
    },

    renderUsers() {
        let usersHTML = '';
        
        if (this.users.length === 0) {
            usersHTML = '<tr><td colspan="5">No users found</td></tr>';
        } else {
            this.users.forEach(user => {
                const statusClass = user.active ? 'status-active' : 'status-sold';
                const statusText = user.active ? 'ACTIVE' : 'INACTIVE';
                const actionText = user.active ? 'Deactivate' : 'Activate';
                
                usersHTML += `
                    <tr>
                        <td>${user.email}</td>
                        <td>${user.role}</td>
                        <td><span class="car-status ${statusClass}">${statusText}</span></td>
                        <td>${Utils.formatDate(user.created_at)}</td>
                        <td>
                            <button class="btn btn-danger" onclick="Admin.toggleUserStatus(${user.id})">
                                ${actionText}
                            </button>
                        </td>
                    </tr>
                `;
            });
        }
        
        document.querySelector('#usersTable tbody').innerHTML = usersHTML;
    },

    async toggleUserStatus(userId) {
        if (!confirm('Toggle user status?')) {
            return;
        }

        try {
            const response = await API.call(`/api/admin/users/${userId}/toggle`, {
                method: 'PUT'
            });

            if (response && response.ok) {
                this.loadUsers();
            } else {
                alert('Failed to toggle user status');
            }
        } catch (error) {
            alert('Error toggling user status: ' + error.message);
        }
    }
};
