/*
  # Create merged catalogues tables

  1. New Tables
    - `merged_catalogues`
      - `id` (uuid, primary key)
      - `name` (text) - Name of the merged catalogue
      - `created_at` (timestamptz) - When the merge was created
      - `created_by` (uuid) - Reference to auth.users
      - `source_catalogues` (jsonb) - Array of source catalogue IDs and metadata
      - `merge_config` (jsonb) - Merge configuration parameters
      - `event_count` (integer) - Total number of events after merging
      - `status` (text) - Current status of the merge
    
    - `merged_events`
      - `id` (uuid, primary key)
      - `catalogue_id` (uuid) - Reference to merged_catalogues
      - `time` (timestamptz) - Event time
      - `latitude` (double precision) - Event latitude
      - `longitude` (double precision) - Event longitude
      - `depth` (double precision) - Event depth in km
      - `magnitude` (double precision) - Event magnitude
      - `source_events` (jsonb) - Original events that were merged
      - `created_at` (timestamptz) - When the event was created

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users to read their own data
*/

-- Create merged catalogues table
CREATE TABLE IF NOT EXISTS merged_catalogues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  source_catalogues jsonb NOT NULL,
  merge_config jsonb NOT NULL,
  event_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'processing',
  CONSTRAINT valid_status CHECK (status IN ('processing', 'complete', 'error'))
);

-- Create merged events table
CREATE TABLE IF NOT EXISTS merged_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalogue_id uuid REFERENCES merged_catalogues(id) ON DELETE CASCADE,
  time timestamptz NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  depth double precision,
  magnitude double precision NOT NULL,
  source_events jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_latitude CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT valid_longitude CHECK (longitude BETWEEN -180 AND 180),
  CONSTRAINT valid_depth CHECK (depth >= 0),
  CONSTRAINT valid_magnitude CHECK (magnitude >= 0)
);

-- Enable RLS
ALTER TABLE merged_catalogues ENABLE ROW LEVEL SECURITY;
ALTER TABLE merged_events ENABLE ROW LEVEL SECURITY;

-- Policies for merged_catalogues
CREATE POLICY "Users can read own merged catalogues"
  ON merged_catalogues
  FOR SELECT
  TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "Users can insert own merged catalogues"
  ON merged_catalogues
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update own merged catalogues"
  ON merged_catalogues
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by);

-- Policies for merged_events
CREATE POLICY "Users can read events from own catalogues"
  ON merged_events
  FOR SELECT
  TO authenticated
  USING (
    catalogue_id IN (
      SELECT id FROM merged_catalogues 
      WHERE created_by = auth.uid()
    )
  );

CREATE POLICY "Users can insert events to own catalogues"
  ON merged_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    catalogue_id IN (
      SELECT id FROM merged_catalogues 
      WHERE created_by = auth.uid()
    )
  );

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS merged_events_catalogue_id_idx ON merged_events(catalogue_id);
CREATE INDEX IF NOT EXISTS merged_events_time_idx ON merged_events(time);
CREATE INDEX IF NOT EXISTS merged_events_location_idx ON merged_events USING gist (
  ll_to_earth(latitude, longitude)
);