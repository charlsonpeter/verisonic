interface PageTitleContext {
  currentUser?: {
    full_name?: string;
    role?: string;
    real_role?: string;
  } | null;
  userMode?: string;
}

export function getPageTitle(activeTab: string, ctx: PageTitleContext = {}): string | null {
  const role = ctx.currentUser?.real_role || ctx.currentUser?.role;

  switch (activeTab) {
    case 'home':
      return 'Home Feed';
    case 'radio':
      return 'Radio Stations';
    case 'search':
      return 'Search';
    case 'favorites':
      return 'My Favorites';
    case 'playlists':
      return 'Playlists';
    case 'contact':
      return 'Contact Support Hub';
    case 'profile':
      return ctx.currentUser?.full_name || 'My Profile';
    case 'station-profile':
      return 'Station Profiles';
    case 'studio-profile':
      return role === 'admin' ? 'Music Studios' : 'Studio Profile';
    case 'settings':
      return 'Settings';
    case 'users':
      return 'User Management';
    case 'tracks':
      return 'Manage Tracks';
    case 'broadcaster-download':
      return 'Broadcaster App';
    case 'analytics':
      return 'System Metrics';
    case 'reports':
      return 'Acoustic Reports';
    case 'details':
      return 'Track Details';
    case 'auth':
      return null;
    default:
      return null;
  }
}
