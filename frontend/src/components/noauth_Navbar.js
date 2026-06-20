import './Noauth_Navbar.css';

import { AiOutlineMenu, AiOutlineClose } from "react-icons/ai";
import { TbUserHexagon, TbLogout, TbChevronDown } from "react-icons/tb";
import { FaUserEdit, FaUserPlus } from "react-icons/fa";
import { MdOutlineSports } from "react-icons/md";
import { useAuth } from '../hooks/useAuth';
import ProfileEditModal from './ProfileEditModal';
import AddUserModal from './AddUserModal';
import { isAdmin, isSuperuser } from '../utils/userRoles';
import ProfileAmbientToggle from './ProfileAmbientToggle';
import { appHref, appPath } from '../config/appRoutes';
import { useResolvedTournamentId } from '../hooks/useResolvedTournamentId';
import { useState, useRef, useEffect } from 'react';

const ROLE_LABELS = {
    superuser: 'Superusuario',
    admin: 'Administrador',
    anotador: 'Anotador',
};


function Noauth_Navbar({ showPublicNavLinks = true, hideAmbientToggle = false }) {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const [profileEditOpen, setProfileEditOpen] = useState(false);
    const [addUserOpen, setAddUserOpen] = useState(false);
    const profileMenuRef = useRef(null);
    const { isAuthenticated, logout, user } = useAuth();
    const currentTournamentId = useResolvedTournamentId();
    const hasToken = localStorage.getItem('token') !== null;
    const isUserAuthenticated = isAuthenticated || hasToken;
    const roleLabel = user?.role ? (ROLE_LABELS[user.role] || user.role) : null;
    const displayFullName = [user?.name, user?.lname].filter(Boolean).join(' ').trim();
    const profileLabel =
        displayFullName ||
        user?.email?.split('@')[0] ||
        (isUserAuthenticated ? 'Cuenta' : '');
    const userIsSuperUser = isSuperuser(user);
    const canInviteUsers = userIsSuperUser || isAdmin(user);
    const sportsManagementRef = appPath('/sports');

    useEffect(() => {
        if (!profileMenuOpen) return;
        const onPointerDown = (e) => {
            if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
                setProfileMenuOpen(false);
            }
        };
        const onKey = (e) => {
            if (e.key === 'Escape') setProfileMenuOpen(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [profileMenuOpen]);

    const handleLogout = () => {
        setProfileMenuOpen(false);
        setIsMobileMenuOpen(false);
        logout({ redirectTo: appPath('/home') });
    };

    const statsRef = currentTournamentId
      ? appHref(`/stats?tournamentId=${currentTournamentId}`)
      : appHref('/stats');
    const calendarRef = currentTournamentId
      ? appHref(`/calendar?tournamentId=${currentTournamentId}`)
      : appHref('/calendar');
    const poolBracketsRef = currentTournamentId
      ? appHref(`/poolbrackets?tournamentId=${currentTournamentId}&view=all`)
      : appHref('/poolbrackets?view=all');


return (
<div className={`Navbar_noauth${showPublicNavLinks ? '' : ' Navbar_noauth--minimal'}`}>
         <div className="navbar-left_noauth"><a href={appPath('/')} className="logo"><img src="/Hera_logo.png" />Herastats</a></div>
         {showPublicNavLinks && (
         <div className="navbar-center_noauth desktop-menu">
            <ul className="nav-links">
                <li><a href={calendarRef} className="a_top_hypers">Calendario</a></li>
                <li><a href={statsRef} className="a_top_hypers">Estadisticas</a></li>
                <li><a href={poolBracketsRef} className="a_top_hypers pool-brackets-link">Pool & Brackets</a></li>
            </ul>
         </div>
         )}

         {showPublicNavLinks && (
         <div className="noauth-mobile-menu-toggle" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
            {isMobileMenuOpen ? <AiOutlineClose size={24} /> : <AiOutlineMenu size={24} />}
         </div>
         )}

         <div className={`noauth-mobile-menu ${showPublicNavLinks && isMobileMenuOpen ? 'noauth-mobile-menu-open' : ''}`}>
            <ul className="noauth-mobile-nav-links">
                {showPublicNavLinks && (
                <>
                <li>
                    <a href={calendarRef} className="noauth-mobile-link" onClick={() => setIsMobileMenuOpen(false)}>
                        Calendario
                    </a>
                </li>
                <li>
                    <a href={statsRef} className="noauth-mobile-link" onClick={() => setIsMobileMenuOpen(false)}>
                        Estadisticas
                    </a>
                </li>
                <li>
                    <a href={poolBracketsRef} className="noauth-mobile-link" onClick={() => setIsMobileMenuOpen(false)}>
                        Pool & Brackets
                    </a>
                </li>
                </>
                )}
                <li>
                    {isUserAuthenticated ? (
                        <>
                            <div className="mobile-user-profile-block">
                                <span className="mobile-user-profile-label">Cuenta</span>
                                {displayFullName && (
                                    <span className="mobile-user-profile-fullname">{displayFullName}</span>
                                )}
                                {user?.email && (
                                    <span className="mobile-user-profile-email">{user.email}</span>
                                )}
                                {roleLabel && (
                                    <span className="mobile-user-profile-role">{roleLabel}</span>
                                )}
                            </div>
                            {!hideAmbientToggle ? <ProfileAmbientToggle dense /> : null}
                            <button
                                type="button"
                                className="noauth-mobile-link noauth-login-mobile mobile-profile-edit-btn"
                                onClick={() => {
                                    setIsMobileMenuOpen(false);
                                    setProfileEditOpen(true);
                                }}
                            >
                                Editar perfil
                            </button>
                            {canInviteUsers && (
                                <button
                                    type="button"
                                    className="noauth-mobile-link noauth-login-mobile mobile-profile-edit-btn"
                                    onClick={() => {
                                        setIsMobileMenuOpen(false);
                                        setAddUserOpen(true);
                                    }}
                                >
                                    {userIsSuperUser ? 'Administración de usuarios' : 'Agregar usuario'}
                                </button>
                            )}
                            {userIsSuperUser && (
                                <a
                                    href={sportsManagementRef}
                                    className="noauth-mobile-link noauth-login-mobile mobile-profile-edit-btn"
                                    onClick={() => setIsMobileMenuOpen(false)}
                                >
                                    Gestión de deportes
                                </a>
                            )}
                            <a
                                href={appPath('/')}
                                className="noauth-mobile-link noauth-login-mobile"
                                onClick={(e) => {
                                    e.preventDefault();
                                    handleLogout();
                                }}
                            >
                                Cerrar sesión
                            </a>
                        </>
                    ) : (
                        <>
                            <a
                                href={appPath('/login')}
                                className="noauth-mobile-link noauth-login-mobile"
                                onClick={() => setIsMobileMenuOpen(false)}
                            >
                                Login
                            </a>
                        </>
                    )}
                </li>
            </ul>
         </div>

         <div className="navbar-right_noauth desktop-menu">
            {isUserAuthenticated ? (
                <div className="user-profile-dropdown" ref={profileMenuRef}>
                    <button
                        type="button"
                        className="user-profile-trigger"
                        aria-expanded={profileMenuOpen}
                        aria-haspopup="true"
                        onClick={() => setProfileMenuOpen((o) => !o)}
                    >
                        <span className="icon"><TbUserHexagon size={22} /></span>
                        <span className="text user-profile-trigger-text">{profileLabel}</span>
                        <TbChevronDown size={18} className={`user-profile-chevron ${profileMenuOpen ? 'user-profile-chevron-open' : ''}`} />
                    </button>
                    {profileMenuOpen && (
                        <div className="user-profile-panel" role="menu">
                            <div className="user-profile-panel-header">
                                {displayFullName && (
                                    <div className="user-profile-panel-fullname">{displayFullName}</div>
                                )}
                                {user?.email && (
                                    <div className="user-profile-panel-email" title={user.email}>
                                        {user.email}
                                    </div>
                                )}
                                {roleLabel && (
                                    <div className="user-profile-panel-role">{roleLabel}</div>
                                )}
                            </div>
                            {!hideAmbientToggle ? <ProfileAmbientToggle /> : null}
                            <button
                                type="button"
                                className="user-profile-logout-btn"
                                role="menuitem"
                                onClick={() => {
                                    setProfileMenuOpen(false);
                                    setProfileEditOpen(true);
                                }}
                            >
                                <FaUserEdit size={20} />
                                <span>Editar perfil</span>
                            </button>
                            {canInviteUsers && (
                                <button
                                    type="button"
                                    className="user-profile-logout-btn"
                                    role="menuitem"
                                    onClick={() => {
                                        setProfileMenuOpen(false);
                                        setAddUserOpen(true);
                                    }}
                                >
                                    <FaUserPlus size={20} />
                                    <span>{userIsSuperUser ? 'Administración de usuarios' : 'Agregar usuario'}</span>
                                </button>
                            )}
                            {userIsSuperUser && (
                                <a
                                    href={sportsManagementRef}
                                    className="user-profile-logout-btn"
                                    role="menuitem"
                                    onClick={() => setProfileMenuOpen(false)}
                                >
                                    <MdOutlineSports size={20} />
                                    <span>Gestión de deportes</span>
                                </a>
                            )}
                            <button
                                type="button"
                                className="user-profile-logout-btn"
                                role="menuitem"
                                onClick={handleLogout}
                            >
                                <TbLogout size={20} />
                                <span>Cerrar sesión</span>
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <a href={appPath('/login')} className="login">
                        <span className='icon'><TbUserHexagon size={25} /></span><span className='text'>Login</span>
                    </a>
            )}
         </div>

        <ProfileEditModal open={profileEditOpen} onClose={() => setProfileEditOpen(false)} />
        <AddUserModal
            open={addUserOpen}
            onClose={() => setAddUserOpen(false)}
            tournamentId={currentTournamentId ? Number(currentTournamentId) : null}
        />

    </div>

)
}


export default Noauth_Navbar;

