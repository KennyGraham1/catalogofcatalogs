'use client';

import { useEffect, useState } from 'react';
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
  Key
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '../theme/ThemeToggle';
import { useAuth } from '@/lib/auth/hooks';
import { signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
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
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

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
    label?: string;
    icon: typeof Activity;
    ariaLabel?: string;
    showLabel?: boolean;
  }> = [
    { href: '/dashboard', label: 'Dashboard', icon: Activity },
    { href: '/upload', label: 'Upload', icon: Upload },
    { href: '/catalogues', label: 'Catalogues', icon: Database },
    { href: '/import', label: 'Import', icon: Download },
    { href: '/merge', label: 'Merge', icon: Layers },
    { href: '/analytics', label: 'Analytics', icon: TrendingUp },
    { href: '/settings', icon: Settings, ariaLabel: 'Settings', showLabel: false },
  ];

  return (
    <header className={cn(
      'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
      isScrolled ? 'bg-background/95 backdrop-blur-md border-b py-3' : 'bg-transparent py-4'
    )}>
      <div className="container flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Activity className="h-6 w-6 text-primary" />
          <span className="font-bold text-lg">EarthQuake Catalogue</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={item.ariaLabel || item.label}
              title={item.ariaLabel || item.label}
            >
              <item.icon className="h-4 w-4" />
              {item.label && item.showLabel !== false && <span>{item.label}</span>}
            </Link>
          ))}
          {onShowSearch && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onShowSearch}
              title="Search events (/)"
            >
              <Search className="h-4 w-4" />
            </Button>
          )}
          {onShowShortcuts && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onShowShortcuts}
              title="Keyboard shortcuts (Ctrl+/)"
            >
              <Keyboard className="h-4 w-4" />
            </Button>
          )}
          <ThemeToggle />

          {/* User Menu */}
          {!isLoading && (
            <>
              {isAuthenticated && user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-9 w-9 rounded-full">
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
                      <DropdownMenuItem onClick={() => router.push('/admin/users')}>
                        <Shield className="mr-2 h-4 w-4" />
                        User Management
                      </DropdownMenuItem>
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push('/login')}
                  >
                    <LogIn className="mr-2 h-4 w-4" />
                    Login
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => router.push('/register')}
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    Sign Up
                  </Button>
                </div>
              )}
            </>
          )}
        </nav>

        {/* Mobile Menu Button */}
        <div className="flex md:hidden items-center gap-2">
          <ThemeToggle />

          {/* Mobile User Menu */}
          {!isLoading && isAuthenticated && user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
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
                  <DropdownMenuItem onClick={() => router.push('/admin/users')}>
                    <Shield className="mr-2 h-4 w-4" />
                    User Management
                  </DropdownMenuItem>
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
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-background border-b">
          <div className="container py-4">
            <nav className="flex flex-col gap-4">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 p-2 hover:bg-muted rounded-md transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label={item.ariaLabel || item.label}
                  title={item.ariaLabel || item.label}
                >
                  <item.icon className="h-5 w-5 text-primary" />
                  {item.label && item.showLabel !== false && <span>{item.label}</span>}
                </Link>
              ))}

              {/* Mobile Auth Buttons */}
              {!isLoading && !isAuthenticated && (
                <>
                  <div className="border-t pt-4 mt-2" />
                  <Button
                    variant="ghost"
                    className="justify-start"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      router.push('/login');
                    }}
                  >
                    <LogIn className="mr-2 h-5 w-5" />
                    Login
                  </Button>
                  <Button
                    variant="default"
                    className="justify-start"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      router.push('/register');
                    }}
                  >
                    <UserPlus className="mr-2 h-5 w-5" />
                    Sign Up
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
