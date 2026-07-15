import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://krnafdfargbcqlcyglua.supabase.co';
const supabaseAnonKey = 'sb_publishable_NUw_K0TH5CUxSC56oMOOkg_nl5saRkz';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
