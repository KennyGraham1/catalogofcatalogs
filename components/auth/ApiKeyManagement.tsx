'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Key, Copy, Trash2, Plus, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string;
  is_active: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export function ApiKeyManagement() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState('read,write');
  const [newKeyExpiry, setNewKeyExpiry] = useState('');
  const [showNewKey, setShowNewKey] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/auth/api-keys');
      if (!response.ok) throw new Error('Failed to fetch API keys');
      const data = await response.json();
      setApiKeys(data.apiKeys || []);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load API keys',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const createApiKey = async () => {
    if (!newKeyName.trim()) {
      toast({
        title: 'Validation error',
        description: 'Please enter a name for the API key',
        variant: 'destructive',
      });
      return;
    }

    try {
      setCreating(true);
      const response = await fetch('/api/auth/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newKeyName,
          scopes: newKeyScopes.split(',').map(s => s.trim()),
          expiresAt: newKeyExpiry || undefined,
        }),
      });

      if (!response.ok) throw new Error('Failed to create API key');

      const data = await response.json();
      setNewlyCreatedKey(data.key);
      setShowNewKey(true);
      setNewKeyName('');
      setNewKeyScopes('read,write');
      setNewKeyExpiry('');
      
      toast({
        title: 'Success',
        description: 'API key created successfully',
      });

      // Refresh the list
      fetchApiKeys();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create API key',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const deleteApiKey = async (id: string) => {
    if (!confirm('Are you sure you want to delete this API key? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/auth/api-keys/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete API key');

      toast({
        title: 'Success',
        description: 'API key deleted successfully',
      });

      fetchApiKeys();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete API key',
        variant: 'destructive',
      });
    }
  };

  const revokeApiKey = async (id: string) => {
    try {
      const response = await fetch(`/api/auth/api-keys/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      });

      if (!response.ok) throw new Error('Failed to revoke API key');

      toast({
        title: 'Success',
        description: 'API key revoked successfully',
      });

      fetchApiKeys();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to revoke API key',
        variant: 'destructive',
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied',
      description: 'API key copied to clipboard',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* New Key Alert */}
      {showNewKey && newlyCreatedKey && (
        <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
          <Key className="h-4 w-4 text-green-600 dark:text-green-400" />
          <AlertDescription className="space-y-2">
            <p className="font-semibold text-green-900 dark:text-green-100">
              API Key Created Successfully
            </p>
            <p className="text-sm text-green-800 dark:text-green-200">
              Make sure to copy your API key now. You won't be able to see it again!
            </p>
            <div className="flex items-center gap-2 mt-2">
              <code className="flex-1 p-2 bg-white dark:bg-gray-900 border rounded text-sm font-mono break-all">
                {revealedKey ? newlyCreatedKey : '••••••••••••••••••••••••••••••••'}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRevealedKey(!revealedKey)}
              >
                {revealedKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button
                size="sm"
                onClick={() => copyToClipboard(newlyCreatedKey)}
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy
              </Button>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowNewKey(false);
                setNewlyCreatedKey(null);
                setRevealedKey(false);
              }}
              className="mt-2"
            >
              I've saved my key
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Create New API Key */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Create New API Key
          </CardTitle>
          <CardDescription>
            Generate a new API key for programmatic access to your catalogues
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="keyName">Key Name</Label>
            <Input
              id="keyName"
              placeholder="My Application"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="keyScopes">Scopes (comma-separated)</Label>
            <Input
              id="keyScopes"
              placeholder="read,write"
              value={newKeyScopes}
              onChange={(e) => setNewKeyScopes(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Available scopes: read, write, delete, admin
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="keyExpiry">Expiry Date (optional)</Label>
            <Input
              id="keyExpiry"
              type="date"
              value={newKeyExpiry}
              onChange={(e) => setNewKeyExpiry(e.target.value)}
            />
          </div>

          <Button onClick={createApiKey} disabled={creating}>
            {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create API Key
          </Button>
        </CardContent>
      </Card>

      {/* Existing API Keys */}
      <Card>
        <CardHeader>
          <CardTitle>Your API Keys</CardTitle>
          <CardDescription>
            Manage your existing API keys
          </CardDescription>
        </CardHeader>
        <CardContent>
          {apiKeys.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No API keys yet. Create one above to get started.
            </p>
          ) : (
            <div className="space-y-4">
              {apiKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{key.name}</h4>
                      {!key.is_active && (
                        <span className="text-xs px-2 py-1 bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 rounded">
                          Revoked
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {key.key_prefix}••••••••
                    </p>
                    <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                      <span>Scopes: {key.scopes}</span>
                      {key.last_used_at && (
                        <span>Last used: {new Date(key.last_used_at).toLocaleDateString()}</span>
                      )}
                      {key.expires_at && (
                        <span>Expires: {new Date(key.expires_at).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {key.is_active && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => revokeApiKey(key.id)}
                      >
                        Revoke
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteApiKey(key.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

