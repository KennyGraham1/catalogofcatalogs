========
Glossary
========

This glossary defines key seismological and technical terms used throughout the
Earthquake Catalogue Platform documentation.

------------------------
Seismological Terms
------------------------

.. glossary::
   :sorted:

   aftershock
      An earthquake that follows a larger earthquake (the mainshock) in the same
      geographic area. Aftershocks typically decrease in frequency and magnitude
      over time following the Omori-Utsu law.

   arrival time
      The time at which a seismic wave is recorded at a seismic station.
      P-wave arrivals are typically used for initial event detection.

   azimuthal gap
      The largest angle (in degrees) between adjacent seismic stations as viewed
      from the earthquake epicenter. Smaller gaps (< 180°) indicate better station
      coverage and more reliable locations. Gaps > 240° often result in poorly
      constrained locations.

   b-value
      The slope of the frequency-magnitude distribution (Gutenberg-Richter relation).
      Typically around 1.0 for tectonic earthquakes. Higher b-values indicate a
      greater proportion of small earthquakes relative to large ones.

   body wave magnitude (mb)
      A magnitude scale based on the amplitude of P-waves, typically used for
      teleseismic events (distance > 20°).

   completeness magnitude (Mc)
      The minimum magnitude above which all earthquakes in a region are reliably
      detected and recorded. Events below Mc may be missing from the catalogue.
      Essential for statistical analyses like b-value calculation.

   depth
      The vertical distance from the Earth's surface to the earthquake hypocenter,
      measured in kilometers. Shallow events (< 70 km), intermediate (70-300 km),
      and deep (> 300 km) earthquakes have different characteristics.

   epicenter
      The point on the Earth's surface directly above the earthquake hypocenter.
      Specified by latitude and longitude coordinates.

   evaluation mode
      Indicates whether an earthquake solution is automatic (computed by software)
      or manual (reviewed by a seismologist). Manual solutions are typically
      more reliable.

   evaluation status
      The review status of an earthquake solution: preliminary, confirmed, reviewed,
      or final. Final solutions represent the most thoroughly reviewed data.

   event type
      Classification of a seismic event, such as earthquake, explosion, quarry blast,
      volcanic, induced, or not existing.

   focal mechanism
      A mathematical description of the fault orientation and slip direction for
      an earthquake, commonly visualized as a "beach ball" diagram showing
      compressional and dilatational first motions.

   foreshock
      An earthquake that precedes a larger earthquake (the mainshock) in the same
      area. Foreshocks cannot be identified until after the mainshock occurs.

   Gutenberg-Richter relation
      An empirical relationship describing the frequency-magnitude distribution
      of earthquakes: log₁₀(N) = a - bM, where N is the number of events with
      magnitude ≥ M, and a and b are constants.

   hypocenter
      The three-dimensional location of earthquake rupture initiation, specified
      by latitude, longitude, and depth. Also called the focus.

   intensity
      A measure of earthquake shaking at a specific location based on observed
      effects and damage. Measured on scales like Modified Mercalli Intensity (MMI).

   local magnitude (ML)
      The original magnitude scale developed by Charles Richter for Southern
      California, based on the maximum amplitude recorded on a Wood-Anderson
      seismograph.

   magnitude
      A quantitative measure of earthquake size, typically based on recorded
      ground motion amplitude. Various magnitude scales exist (ML, Mw, mb, Ms).

   magnitude type
      The specific magnitude scale used for measurement, such as ML (local),
      Mw (moment), mb (body wave), or Ms (surface wave).

   mainshock
      The largest earthquake in a sequence of events occurring in a specific
      area and time window.

   moment magnitude (Mw)
      A magnitude scale based on seismic moment, which is proportional to fault
      area × average slip × rock rigidity. Preferred for large earthquakes as it
      does not saturate at high magnitudes.

   origin time
      The time at which earthquake rupture initiated at the hypocenter.

   P-wave
      Primary (or compressional) wave - the fastest type of seismic body wave.
      P-waves travel through both solid and liquid media and arrive first at
      seismic stations.

   phase
      A distinct seismic wave arrival at a station, such as P, S, or surface waves.
      Multiple phases from multiple stations constrain earthquake locations.

   pick
      The identified arrival time of a seismic phase at a station, either
      automatically detected or manually identified by an analyst.

   quality score
      A numerical assessment (0-100) of earthquake location and magnitude reliability
      based on factors like station coverage, uncertainties, and solution parameters.

   residual
      The difference between observed and predicted arrival times. Small residuals
      indicate a good velocity model and accurate location.

   RMS residual
      Root Mean Square of travel time residuals. A measure of overall fit quality
      for an earthquake location. Lower values indicate better solutions.

   S-wave
      Secondary (or shear) wave - slower than P-waves and cannot travel through
      liquids. S-wave arrivals help constrain earthquake depth.

   seismic moment
      A physical measure of earthquake size defined as M₀ = μ × A × D, where μ is
      rock rigidity, A is fault area, and D is average slip. Related to moment
      magnitude by Mw = (log₁₀(M₀) - 9.1) / 1.5.

   station coverage
      The spatial distribution and density of seismic stations around an earthquake.
      Good coverage (many well-distributed stations) improves location accuracy.

   surface wave magnitude (Ms)
      A magnitude scale based on the amplitude of surface waves, typically used
      for shallow teleseismic events.

   swarm
      A sequence of many earthquakes occurring in a limited area and time without
      a clearly dominant mainshock.

   uncertainty ellipse
      An ellipse (or ellipsoid in 3D) representing the statistical uncertainty
      in earthquake location, typically at a specified confidence level (e.g., 95%).

   used phase count
      The number of seismic phase arrivals used in determining an earthquake location.
      More phases generally result in more accurate and better-constrained locations.

   used station count
      The number of seismic stations whose data contributed to the earthquake
      location solution. More stations typically improve location accuracy.

------------------------
Technical Terms
------------------------

.. glossary::
   :sorted:

   API
      Application Programming Interface. A set of protocols and tools for building
      software applications. The platform provides a REST API for programmatic access.

   catalogue
      A collection of earthquake events stored with shared metadata and consistent
      schema. Catalogues can be uploaded, imported from external sources, merged,
      and exported.

   CSV
      Comma-Separated Values. A plain text format for tabular data where values
      are separated by commas (or other delimiters).

   FDSN
      International Federation of Digital Seismograph Networks. An organization
      that develops standards for seismic data exchange, including web services
      for event data.

   GeoJSON
      A format for encoding geographic data structures using JSON. Events are
      represented as Point features with properties.

   GeoNet
      New Zealand's official geological hazard monitoring system, operated by
      GNS Science. Provides real-time earthquake data via FDSN web services.

   JSON
      JavaScript Object Notation. A lightweight data interchange format that is
      easy for humans to read and write and for machines to parse and generate.

   merge
      The process of combining multiple earthquake catalogues into a single
      catalogue, with intelligent duplicate detection and conflict resolution.

   MongoDB
      A document-oriented NoSQL database used by the platform to store earthquake
      events and catalogues.

   Next.js
      A React-based web framework used for the platform's frontend and API routes.

   QuakeML
      An XML-based standard developed by the seismological community for exchanging
      earthquake event data. The platform supports QuakeML 1.2 BED (Basic Event
      Description) format.

   REST
      Representational State Transfer. An architectural style for web APIs using
      HTTP methods (GET, POST, PUT, DELETE) to perform operations on resources.

   RTD
      Read the Docs. A documentation hosting platform that automatically builds
      and publishes Sphinx documentation from version control repositories.

   schema
      The structure and organization of data, defining what fields are present,
      their types, and validation rules.

   Sphinx
      A documentation generator that converts reStructuredText files into various
      output formats including HTML, PDF, and ePub.

   UUID
      Universally Unique Identifier. A 128-bit identifier used to uniquely
      identify catalogues and events in the database.

   validation
      The process of checking data against defined rules and constraints to ensure
      quality and consistency before storage.

------------------------
Quality Grades
------------------------

.. glossary::

   A+ grade
      Excellent quality (95-100 score). Publication-quality data with comprehensive
      metadata, small uncertainties, and excellent station coverage.

   A grade
      Excellent quality (90-94 score). High-quality, reliable data suitable for
      most research applications.

   B grade
      Good quality (80-89 score). Suitable for general analysis with minor
      limitations in some parameters.

   C grade
      Fair quality (70-79 score). Acceptable for preliminary analysis but may
      have significant uncertainties or missing metadata.

   D grade
      Poor quality (60-69 score). Use with caution; significant data quality
      issues may affect analysis results.

   F grade
      Failing quality (< 60 score). Insufficient quality for reliable analysis;
      data should be reviewed and improved before use.
