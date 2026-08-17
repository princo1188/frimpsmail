
            import { createClient } from "@supabase/supabase-js";

            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

            export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
              auth: {
                // Prevent concurrent tabs/requests from forcefully stealing the
                // navigator lock and aborting each other. 0 disables the timeout
                // so locks are only held while the operation is active.
                lockAcquireTimeout: 0,
              } as any,
            });
            