'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  Upload,
  Layers,
  Settings,
  Menu,
  X,
  Database,
  TrendingUp,
  Download,
  Keyboard,
  Search,
  User,
  LogOut,
  LogIn,
  UserPlus,
  Shield,
  Key,
  ClipboardList
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '../theme/ThemeToggle';
import { useAuth } from '@/lib/auth/hooks';
import { loginHref } from '@/lib/auth/login-href';
import { registerHref } from '@/lib/auth/access-request';
import { signOut } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';


interface HeaderProps {
  onShowShortcuts?: () => void;
  onShowSearch?: () => void;
}

export function Header({ onShowShortcuts, onShowSearch }: HeaderProps = {}) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // Sign-in and registration return the user to the page they were on.
  const signInHref = loginHref(pathname);
  const signUpHref = registerHref(pathname);
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Escape closes the open mobile menu and returns focus to its button. An Escape that
  // an open dropdown (theme or account menu) has already handled is left alone: Radix
  // marks it with preventDefault in its capture-phase listener.
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      setMobileMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    router.push('/');
  };

  const getUserInitials = (name?: string) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navItems: Array<{
    href: string;
    label: string;
    icon: typeof Activity;
    /** Desktop row only: show the icon alone (named by aria-label and a tooltip). */
    desktopIconOnly?: boolean;
  }> = [
    { href: '/dashboard', label: 'Dashboard', icon: Activity },
    { href: '/upload', label: 'Upload', icon: Upload },
    { href: '/catalogues', label: 'Catalogues', icon: Database },
    { href: '/import', label: 'Import', icon: Download },
    { href: '/merge', label: 'Merge', icon: Layers },
    { href: '/analytics', label: 'Analytics', icon: TrendingUp },
    { href: '/settings', label: 'Settings', icon: Settings, desktopIconOnly: true },
  ];

  return (
    <header className={cn(
      'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
      isScrolled ? 'bg-background/95 backdrop-blur-md border-b py-3' : 'bg-transparent py-4'
    )}>
      <div className="container flex items-center justify-between gap-3">
        {/* Below sm the full name does not fit beside the theme, account and menu buttons
            (at 320 px it pushed them about 50 px past the screen), so a short wordmark is
            shown there; the full name stays the link's accessible name at every width. */}
        <Link href="/" className="flex min-w-0 items-center gap-2 whitespace-nowrap sm:shrink-0">
          <Activity className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
          <span aria-hidden="true" data-brand="short" className="truncate text-base font-bold sm:hidden">
            EQ Catalogue
          </span>
          <span data-brand="full" className="sr-only text-lg font-bold sm:not-sr-only sm:whitespace-nowrap">
            EarthQuake Catalogue
          </span>
        </Link>

        {/* Desktop Navigation. Signed out, the full row (logo, seven links with labels, three
            icon buttons, Login and Sign Up) is about 1,340 px wide, so: below lg the menu
            button; from lg icons with tooltips; from xl labels at a tighter spacing; from
            2xl the roomy spacing. Each step fits its narrowest viewport with a scrollbar. */}
        <nav className="hidden lg:flex items-center gap-4 2xl:gap-6 text-sm 2xl:text-base" aria-label="Main">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-1.5 transition-colors',
                isActive(item.href)
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              aria-label={item.label}
              aria-current={isActive(item.href) ? 'page' : undefined}
              title={item.label}
            >
              <item.icon className="h-4 w-4" aria-hidden="true" />
              {!item.desktopIconOnly && <span className="hidden xl:inline">{item.label}</span>}
            </Link>
          ))}
          {onShowSearch && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onShowSearch}
              aria-label="Search events"
              title="Search events (/)"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
          {onShowShortcuts && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onShowShortcuts}
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts (Ctrl+/)"
            >
              <Keyboard className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
          <ThemeToggle />

          {/* User Menu */}
          {!isLoading && (
            <>
              {isAuthenticated && user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="relative h-9 w-9 rounded-full"
                      aria-label={`Account menu for ${user.name || user.email || 'your account'}`}
                    >
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {getUserInitials(user.name)}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{user.name}</p>
                        <p className="text-xs leading-none text-muted-foreground">
                          {user.email}
                        </p>
                        <p className="text-xs leading-none text-muted-foreground mt-1">
                          Role: {user.role}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => router.push('/profile')}>
                      <User className="mr-2 h-4 w-4" />
                      Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push('/change-password')}>
                      <Key className="mr-2 h-4 w-4" />
                      Change Password
                    </DropdownMenuItem>
                    {user.role === 'admin' && (
                      <>
                        <DropdownMenuItem onClick={() => router.push('/admin/users')}>
                          <Shield className="mr-2 h-4 w-4" />
                          User Management
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => router.push('/admin/role-requests')}>
                          <ClipboardList className="mr-2 h-4 w-4" />
                          Role Requests
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSignOut}>
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div className="flex items-center gap-2">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={signInHref}>Login</Link>
                  </Button>
                  <Button asChild variant="default" size="sm">
                    <Link href={signUpHref}>Sign Up</Link>
                  </Button>
                </div>
              )}
            </>
          )}
        </nav>

        {/* Mobile Menu Button */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-2 lg:hidden">
          <ThemeToggle />

          {/* Mobile User Menu */}
          {!isLoading && isAuthenticated && user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-8 w-8 rounded-full"
                  aria-label={`Account menu for ${user.name || user.email || 'your account'}`}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {getUserInitials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user.name}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user.email}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground mt-1">
                      Role: {user.role}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push('/profile')}>
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/change-password')}>
                  <Key className="mr-2 h-4 w-4" />
                  Change Password
                </DropdownMenuItem>
                {user.role === 'admin' && (
                  <>
                    <DropdownMenuItem onClick={() => router.push('/admin/users')}>
                      <Shield className="mr-2 h-4 w-4" />
                      User Management
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push('/admin/role-requests')}>
                      <ClipboardList className="mr-2 h-4 w-4" />
                      Role Requests
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Button
            ref={menuButtonRef}
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-nav"
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>

      {/* Mobile Menu. Capped at the viewport height below the header bar (72 px, 4.5rem)
          and scrolled internally, so on a short screen (390 x 500) Login and Sign Up stay
          reachable instead of falling below the screen with the page behind them. */}
      {mobileMenuOpen && (
        <div
          id="mobile-nav"
          data-mobile-menu
          className="max-h-[calc(100vh-4.5rem)] overflow-y-auto overscroll-contain border-b bg-background supports-[height:100dvh]:max-h-[calc(100dvh-4.5rem)] lg:hidden"
        >
          <div className="container py-3">
            <nav className="flex flex-col gap-1" aria-label="Main">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 p-2 rounded-md transition-colors',
                    isActive(item.href)
                      ? 'bg-muted font-medium text-foreground'
                      : 'hover:bg-muted'
                  )}
                  onClick={() => setMobileMenuOpen(false)}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                >
                  <item.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              ))}

              {/* Mobile Auth Buttons */}
              {!isLoading && !isAuthenticated && (
                <>
                  <div className="my-2 border-t" />
                  <Button asChild variant="ghost" className="justify-start">
                    <Link href={signInHref} onClick={() => setMobileMenuOpen(false)}>
                      <LogIn className="mr-2 h-5 w-5" aria-hidden="true" />
                      Login
                    </Link>
                  </Button>
                  <Button asChild variant="default" className="justify-start">
                    <Link href={signUpHref} onClick={() => setMobileMenuOpen(false)}>
                      <UserPlus className="mr-2 h-5 w-5" aria-hidden="true" />
                      Sign Up
                    </Link>
                  </Button>
                </>
              )}
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
