import './navbar.css';
import {  AiOutlineMenu, AiOutlineClose   } from "react-icons/ai";
import { TbUserHexagon, TbTournament, TbLogout, TbChevronDown, TbHierarchy3, TbChartBar } from "react-icons/tb";
import { IoCalendarNumberSharp } from "react-icons/io5";
import { MdGroups, MdOutlineSports } from "react-icons/md";
import { RiTeamFill } from "react-icons/ri";
import { FaRunning } from "react-icons/fa";
import { FaUsersCog, FaUserEdit, FaUserPlus } from "react-icons/fa";
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import ProfileEditModal from './ProfileEditModal';
import AddUserModal from './AddUserModal';
import ProfileAmbientToggle from './ProfileAmbientToggle';
import { appHref, appPath } from '../config/appRoutes';
import { useResolvedTournamentId } from '../hooks/useResolvedTournamentId';

import { isAdmin, isAnotador, isSuperuser, normalizeRole } from '../utils/userRoles';

const ROLE_LABELS = {
    superuser: 'Superusuario',
    admin: 'Administrador',
    anotador: 'Anotador',
};

function roleLabelForUser(user) {
    const r = normalizeRole(user?.role);
    return r ? (ROLE_LABELS[r] || user?.role) : null;
}

function Navbar({ tournamentId = null, hideAmbientToggle = false }) {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const [profileEditOpen, setProfileEditOpen] = useState(false);
    const [addUserOpen, setAddUserOpen] = useState(false);
    const profileMenuRef = useRef(null);
    const { isAuthenticated, logout, user } = useAuth();
    const currentTournamentId = useResolvedTournamentId(tournamentId);

    const hasToken = localStorage.getItem('token') !== null;
    const isUserAuthenticated = isAuthenticated || hasToken;

    const configRef = appHref(currentTournamentId ? `/config/${currentTournamentId}` : '/config');
    const teamRef = currentTournamentId
      ? appHref(`/team?tournamentId=${currentTournamentId}`)
      : appHref('/team');
    const playersRef = currentTournamentId
      ? appHref(`/players?tournamentId=${currentTournamentId}`)
      : appHref('/players');
    const groupsRef = currentTournamentId
      ? appHref(`/groupsconfig?tournamentId=${currentTournamentId}`)
      : appHref('/groupsconfig');
    const calendarconfigRef = currentTournamentId
      ? appHref(`/calendarconfig?tournamentId=${currentTournamentId}`)
      : appHref('/calendarconfig');
    const configBracketsRef = currentTournamentId
      ? appHref(`/brackets?tournamentId=${currentTournamentId}&view=main`)
      : appHref('/brackets?view=main');
    const statsRef = currentTournamentId
      ? appHref(`/stats?tournamentId=${currentTournamentId}`)
      : appHref('/stats');
    const calendarRef = currentTournamentId
      ? appHref(`/calendar?tournamentId=${currentTournamentId}`)
      : appHref('/calendar');
    const anotacionRef = currentTournamentId
      ? appHref(`/anotacion?tournamentId=${currentTournamentId}`)
      : appHref('/anotacion');
    const poolBracketsRef = currentTournamentId
      ? appHref(`/poolbrackets?tournamentId=${currentTournamentId}&view=all`)
      : appHref('/poolbrackets?view=all');
    const homeRef = appPath('/home');
    const userManagementRef = appPath('/users');
    const analyticsRef = appPath('/analytics');
    const sportsManagementRef = appPath('/sports');
    const userIsSuperUser = isSuperuser(user);
    const userIsAdmin = isAdmin(user);
    const userIsAnotador = isAnotador(user);
    const canInviteUsers = userIsSuperUser || userIsAdmin;
    const canSeeConfig = userIsAdmin || userIsSuperUser;
    const canSeeAnotaciones = userIsAdmin || userIsSuperUser || userIsAnotador;
    const roleLabel = roleLabelForUser(user);
    const displayFullName = [user?.name, user?.lname].filter(Boolean).join(' ').trim();
    const profileLabel =
        displayFullName ||
        user?.email?.split('@')[0] ||
        (isUserAuthenticated ? 'Cuenta' : '');

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
        logout({ redirectTo: appPath('/home') });
    };
    const menuitems = {
        "items" : [
          {"id": "1","icon":"TbTournament","name": "Torneo","description":"parámetros del torneo","ref": configRef},
          {"id": "2","icon":"RiTeamFill","name": "Equipos","description":"Equipos del torneo","ref": teamRef},
          {"id": "3","icon":"FaRunning","name": "Jugadores","description":"jugadores por equipo","ref": playersRef},
          {"id": "4","icon":"MdGroups","name": "Grupos","description":"grupos del torneo","ref": groupsRef},
          {"id": "5","icon":"IoCalendarNumberSharp","name": "Calendario","description":"Calendario del torneo","ref": calendarconfigRef},
          {"id": "6","icon":"TbHierarchy3","name": "Brackets","description":"editar juegos y llaves","ref": configBracketsRef},
          ...(userIsSuperUser
            ? [
                {"id": "7","icon":"FaUsersCog","name": "Usuarios","description":"gestion de usuarios","ref": userManagementRef},
                {"id": "8","icon":"TbChartBar","name": "Visitas","description":"estadisticas del sitio","ref": analyticsRef}
              ]
            : [])
        ] 
      } 
    
      // Mapeo de iconos
      const iconMap = {
        TbTournament : TbTournament ,
        RiTeamFill: RiTeamFill,
        FaRunning: FaRunning,
        MdGroups: MdGroups,
        IoCalendarNumberSharp: IoCalendarNumberSharp,
        TbHierarchy3: TbHierarchy3,
        FaUsersCog: FaUsersCog,
        TbChartBar: TbChartBar
      };

return (
    <div className="Navbar">
         <div className="navbar-left"><a href={homeRef} className="logo"><img src="/Hera_logo.png" />Herastats</a></div>
         
         {/* Menú de escritorio */}
         <div className="navbar-center desktop-menu">
            <ul className="nav-links">
                <li><a href={calendarRef} className="a_top_hypers">Calendario</a></li>
                <li><a href={statsRef} className="a_top_hypers">Estadisticas</a></li>
                <li><a href={poolBracketsRef} className="a_top_hypers pool-brackets-link">Pool & Brackets</a></li>
                {canSeeConfig && (
                  <li className="dropdown">
                      <a href="#" className="a_top_hypers">Configuracion</a>
                      <div className="dropdown-content">
                          <div className='supermenu-container'>
                          {menuitems.items.map((item) => {
                            const IconComponent = iconMap[item.icon];
                            return (
                              <a href={item.ref} key={item.id}><div className='Icon'>
                                <h3><IconComponent size={35} /></h3>
                                <div className='Icon-text'>
                                  <p className='title'>{item.name}</p>
                                  <p className='description'>{item.description}</p>
                                </div>
                              </div>
                              </a>
                            );
                          })}
                      </div>
                      </div>
                  </li>
                )}
                {canSeeAnotaciones && <li><a href={anotacionRef} className="a_top_hypers">Anotaciones</a></li>}
       
            </ul>
         </div>

         {/* Menú móvil hamburguesa */}
         <div className="mobile-menu-toggle" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
            {isMobileMenuOpen ? <AiOutlineClose size={24} /> : <AiOutlineMenu size={24} />}
         </div>

         {/* Menú móvil desplegable */}
         <div className={`mobile-menu ${isMobileMenuOpen ? 'mobile-menu-open' : ''}`}>
            <ul className="mobile-nav-links">
                <li><a href={calendarRef} className="mobile-link">Calendario</a></li>
                <li><a href={statsRef} className="mobile-link">Estadisticas</a></li>
                <li><a href={poolBracketsRef} className="mobile-link">Pool & Brackets</a></li>
                {canSeeConfig && (
                  <li className="mobile-dropdown">
                      <a href="#" className="mobile-link">Configuracion</a>
                      <div className="mobile-dropdown-content">
                          {menuitems.items.map((item) => {
                            const IconComponent = iconMap[item.icon];
                            return (
                              <a href={item.ref} key={item.id} className="mobile-dropdown-item">
                                <IconComponent size={20} />
                                <span>{item.name}</span>
                              </a>
                            );
                          })}
                      </div>
                  </li>
                )}
                {canSeeAnotaciones && <li><a href={anotacionRef} className="mobile-link">Anotaciones</a></li>}
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
                                className="mobile-link login-mobile mobile-profile-edit-btn"
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
                                    className="mobile-link login-mobile mobile-profile-edit-btn"
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
                                    href={analyticsRef}
                                    className="mobile-link login-mobile mobile-profile-edit-btn"
                                    onClick={() => setIsMobileMenuOpen(false)}
                                >
                                    Visitas del sitio
                                </a>
                            )}
                            {userIsSuperUser && (
                                <a
                                    href={sportsManagementRef}
                                    className="mobile-link login-mobile mobile-profile-edit-btn"
                                    onClick={() => setIsMobileMenuOpen(false)}
                                >
                                    Gestión de deportes
                                </a>
                            )}
                            <a
                                href={appPath('/')}
                                className="mobile-link login-mobile"
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
                            <a href={appPath('/login')} className="mobile-link login-mobile">Login</a>
                        </>
                    )}
                </li>
            </ul>
         </div>

         <div className="navbar-right desktop-menu">
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
                                    href={analyticsRef}
                                    className="user-profile-logout-btn"
                                    role="menuitem"
                                    onClick={() => setProfileMenuOpen(false)}
                                >
                                    <TbChartBar size={20} />
                                    <span>Visitas del sitio</span>
                                </a>
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


export default Navbar;

