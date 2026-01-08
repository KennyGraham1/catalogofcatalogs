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
  Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '../theme/ThemeToggle';


interface HeaderProps {
  onShowShortcuts?: () => void;
  onShowSearch?: () => void;
}

export function Header({ onShowShortcuts, onShowSearch }: HeaderProps = {}) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: Activity },
    { href: '/upload', label: 'Upload', icon: Upload },
    { href: '/catalogues', label: 'Catalogues', icon: Database },
    { href: '/import', label: 'Import', icon: Download },
    { href: '/merge', label: 'Merge', icon: Layers },
    { href: '/analytics', label: 'Visualization & Analytics', icon: TrendingUp },
    { href: '/settings', label: 'Settings', icon: Settings },
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
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
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

        </nav>

        {/* Mobile Menu Button */}
        <div className="flex md:hidden items-center gap-4">
          <ThemeToggle />

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
                >
                  <item.icon className="h-5 w-5 text-primary" />
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}