/**
 * Notification Module
 * Provides a shared toast notification system for the application
 */

/**
 * Show a toast notification
 * @param {string} message - Message to display
 * @param {string} type - Notification type: 'success', 'error', or 'info'
 */
export function showNotification(message, type = 'success') {
    let notification = document.getElementById('appNotification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'appNotification';
        notification.style.cssText = `
            position: fixed;
            right: 20px;
            bottom: 20px;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-family: Arial, sans-serif;
            font-size: 13px;
            z-index: 10001;
            max-width: 400px;
            transition: opacity 0.3s ease;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        document.body.appendChild(notification);
    }

    notification.textContent = message;
    const colors = {
        error: 'rgba(220, 53, 69, 0.9)',
        info: 'rgba(59, 130, 246, 0.9)',
        success: 'rgba(34, 139, 34, 0.9)'
    };
    notification.style.background = colors[type] || colors.success;
    notification.style.opacity = '1';

    setTimeout(() => {
        notification.style.opacity = '0';
    }, 4000);
}
