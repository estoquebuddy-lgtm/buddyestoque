import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useProfile() {
  const { user } = useAuth();

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      if (error) {
        console.error('Error fetching profile:', error);
        return null;
      }
      return data;
    },
    enabled: !!user,
    retry: 1,
  });

  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ['user-roles', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);
      if (error) {
        console.error('Error fetching user roles:', error);
        return [];
      }
      return (data || []).map((r: any) => r.role as string);
    },
    enabled: !!user,
    retry: 1,
  });

  const isAdmin = roles.includes('admin');
  const isApproved = profile?.approved ?? false;

  return {
    profile,
    roles,
    isAdmin,
    isApproved,
    loading: profileLoading || rolesLoading,
  };
}
