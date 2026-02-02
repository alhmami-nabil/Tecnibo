        // Configuration
        const CONFIG = {
            // Cookie name to check
            cookieName: 'cf_upload_gate',
            
            // URL to redirect if cookie exists
            redirectUrl: 'https://backend.tecnibo.com/tools/fiches',
            
            // Delay before redirect (in milliseconds)
            redirectDelay: 1500
        };

        // Function to get cookie by name
        function getCookie(name) {
            const cookies = document.cookie.split(';');
            for (let cookie of cookies) {
                const [cookieName, cookieValue] = cookie.trim().split('=');
                if (cookieName === name) {
                    return cookieValue;
                }
            }
            return null;
        }

        // Main function to check cookies
        function checkCookies() {
            const loader = document.getElementById('loader');
            const message = document.getElementById('message');
            const retryBtn = document.getElementById('retryBtn');
            
            loader.style.display = 'block';
            message.innerHTML = '';
            retryBtn.style.display = 'none';
            
            setTimeout(() => {
                loader.style.display = 'none';
                
                // Check for cf_upload_gate cookie
                const cookieValue = getCookie(CONFIG.cookieName);
                
                if (cookieValue !== null) {
                    message.innerHTML = '<div class="success">✅ cf_upload_gate cookie found!<br>Redirecting...</div>';
                    setTimeout(() => {
                        window.location.href = CONFIG.redirectUrl;
                    }, CONFIG.redirectDelay);
                } else {
                    message.innerHTML = '<div class="error">❌ Error: cf_upload_gate cookie not found!<br>Please make sure you have access.</div>';
                    retryBtn.style.display = 'inline-block';
                }
            }, 500);
        }

        // Run check on page load
        window.onload = checkCookies;