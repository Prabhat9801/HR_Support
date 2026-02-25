import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';

export default function OAuthCallbackPage() {
    const navigate = useNavigate();
    const location = useLocation();

    const hasRequested = React.useRef(false);

    useEffect(() => {
        if (hasRequested.current) return;

        const processOAuth = async () => {
            hasRequested.current = true;
            // Get the 'code' from URL query parameters
            const params = new URLSearchParams(location.search);
            const code = params.get('code');
            const error = params.get('error');

            if (error) {
                toast.error("Google Authentication failed or was cancelled.");
                navigate('/onboarding');
                return;
            }

            if (!code) {
                toast.error("No authorization code found in URL.");
                navigate('/onboarding');
                return;
            }

            // Check for onboarding or settings context
            const companyId = localStorage.getItem('botivate_onboarding_company');

            if (!companyId) {
                toast.error("Lost session context. Please try again.");
                navigate('/onboarding');
                return;
            }

            try {
                toast.loading("Connecting your Google Workspace...", { id: 'oauth' });

                // Exchange code for tokens on backend
                await axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/companies/oauth-exchange`, {
                    code: code,
                    company_id: companyId
                });

                toast.success("Google connected successfully!", { id: 'oauth' });

                // Return to Onboarding Step 2
                localStorage.setItem('botivate_google_connected', 'true');
                navigate('/onboarding');

            } catch (err) {
                console.error("OAuth Exchange Error:", err);
                toast.error(err.response?.data?.detail || "Failed to establish secure connection.", { id: 'oauth' });
                navigate('/onboarding');
            }
        };

        processOAuth();
    }, [location, navigate]);

    return (
        <div className="auth-layout fade-in" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
            <div className="loader"></div>
            <h2 style={{ marginTop: '2rem' }}>Securing your Google connection...</h2>
            <p style={{ color: 'var(--text-secondary)' }}>Please wait a moment while we set up your workspace.</p>
        </div>
    );
}
