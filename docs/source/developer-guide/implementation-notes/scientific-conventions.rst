=======================
Scientific Conventions
=======================

This page records the scientific and data-handling conventions the platform
follows: the choices that the code alone cannot explain. Each one is enforced
by the implementation and covered by the test suite.

Scientific conventions decided
==============================

Gardner-Knopoff window direction
   The window is applied **forward in time** from each mainshock, as in
   Gardner and Knopoff (1974) and as OpenQuake's ``hmtk`` does when its
   foreshock proportion is set to zero. Foreshocks are therefore retained. On
   the paper's synthetic catalogue a symmetric window removes a further 2,635
   events and lowers the declustered *b* by 0.05, so the convention is stated
   wherever a declustered *b* is quoted. Cluster heads are reserved so a later,
   smaller candidate cannot reassign them.

Reasenberg linking
   An event joins a cluster when it lies inside the interaction zone of
   *either* the cluster's largest event *or* its most recent event, and the
   test is on **hypocentral** distance (the interaction zone is a sphere about
   the hypocentre). Gardner-Knopoff keeps its epicentral windows, which is how
   that method was calibrated. Reasenberg is available in the analysis library
   only; the browser worker exposes Gardner-Knopoff.

Seismic moment
   Hanks-Kanamori is defined for moment magnitude only. Mw enters exactly; ML,
   GeoNet's bare ``M`` summary magnitude and untyped magnitudes enter under a
   disclosed ML ≈ Mw assumption; mb, Ms and Md are excluded because they
   saturate. The analytics panel states both counts.

Magnitude conversion and selection
   Scordilis (2006) is used for mb (3.5 to 6.2) and Ms (3.0 to 8.2). Outside
   those ranges the result is labelled an extrapolation with a wider
   uncertainty. Only the mixed-case spelling ``mB`` denotes ISC's broadband
   scale and ``mbLg`` the regional Lg scale; neither is converted. The merge
   selector reads the stored alternatives, carries the selected measurement's
   uncertainty, station count, method and review state with it, and points
   ``preferred_magnitude_id`` at that measurement.

Location weighting
   Averaged epicentres weight sources by inverse variance (1/σ²), with
   uncertainties normalised to kilometres first.

Horizontal uncertainty precedence
   Everywhere a single horizontal uncertainty is needed (map ellipse, card,
   quality factor, catalogue-level accuracy) it is resolved in the same order:
   error-ellipse semi-major axis, then the circular ``horizontal_uncertainty``
   radius, then the latitude/longitude marginals converted to kilometres at the
   event latitude. A reported zero is a reported (excellent) uncertainty; only
   the map drawing needs a positive radius. Ellipse vertices are walked on the
   sphere so they never leave the WGS84 latitude domain.

Focal mechanisms
   A preferred plane is asserted only when the source states one. A plane with
   a missing angle yields no beach ball and no fault-type classification; the
   missing angle is shown as missing and is not exported as a BED nodal plane.
   Principal-axis lengths take the same unit scale as the tensor. Either plane
   may be supplied alone.

Station coverage
   Arrivals are counted once per station (a station with P and S arrivals is
   one station), stored origin quality outranks a partial phase list and stands
   alone without phases, and the Haversine accumulator is clamped so antipodal
   points give half the circumference.

Association (merge)
   Candidate search is a time-bounded slice with a global-window early exit;
   equal timestamps tie-break on source then id so grouping is deterministic;
   +180 and -180 share one storage cell; anchors within 10 degrees of a pole
   bypass the longitude-cell filter; a group never holds two records from one
   source; a rejected provisional group releases its singletons; merged
   ``source_id`` values are qualified by the agency they came from and identity
   fields are never borrowed from another agency.

Data conventions decided
========================

CSV numeric fields
   Numeric literals only. A cell such as ``4.1garbage`` or ``10 km`` is
   rejected with a message rather than truncated to a number. Units are decided
   per file (depth unit inference), not per cell.

Magnitude columns
   Resolved from the raw row independent of column order: a scale-named ``Mw``
   column wins, then the generic magnitude with its stated type, then ``ML``.
   Every other value present is kept as an alternative in ``magnitudes`` and is
   exported beside the selected one.

Dates
   Split date columns must be valid calendar values (no roll-over of month 13
   or 31 April; years below 100 are literal). A zone designator does not
   override the declared day/month order. Fractional seconds carry into the
   next minute.

GeoJSON
   Features that identify as USGS/ComCat or GeoNet output follow those
   producers' conventions (time in milliseconds, third coordinate in km).
   Any other producer's bare numeric time is seconds below 1e11, and a third
   coordinate inside the km-depth band is read as km with a once-per-file
   disclosure; an explicit ``depth`` property always wins. A numeric feature
   id of 0 is kept. Own exports carry no ``bbox`` on 3D data.

QuakeML
   Parsed by SAX for every size; a bare ``&`` outside CDATA is escaped, every
   other well-formedness error fails the document. ``xs:double`` values must
   match the lexical grammar. Resource identifiers are escaped injectively
   (``~XX`` for Latin-1, ``~uXXXXXX`` above). ``preferredPlane`` is an
   attribute of ``nodalPlanes`` and only names an emitted plane.

Import persistence
   The insert validator's ranges are the single source of truth
   (``EVENT_OPTIONAL_RANGES`` in ``lib/db.ts``). The upload route drops
   out-of-range optional values and skips rows outside the 1000-01-01 to now
   window with a reason; it never fails a whole upload on one row. Bounds are
   computed only from rows that were actually written. A GeoNet text body that
   ends mid-row is rejected as truncated; rows GeoNet cannot express are
   reported per record and do not condemn the catalogue.

Geographic queries
   Boxes crossing the antimeridian use the RFC 7946 west > east convention;
   +180 and -180 are one meridian for membership tests but unions keep their
   shape. Nearby-fault distance is to the trace (spherical cross-track). The
   fault lookup queries a 5 / 20 / full-radius ladder and stops as soon as the
   requested count lies inside the box; a box the service truncates is
   quartered and then paged, and a still-incomplete result is reported as such
   rather than ranked.

Not changed, by decision
========================

* The GeoNet chunker may exceed its request budget by a few subdivision
  requests; this is a documented contract.
* A GeoNet text body cut inside the last value of an otherwise complete final
  row cannot be told from a complete row at the text level; transport-level
  truncation is already rejected by ``fetch``.
* Reasenberg is not exposed in the browser worker.
