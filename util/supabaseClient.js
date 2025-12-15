const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

const configPath = path.resolve(__dirname, '..', 'Config.env');
dotenv.config({ path: configPath });

const supabaseUrl = process.env.SUPABASEURL;
const supabaseKey = process.env.SUPABASEKEY;

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
