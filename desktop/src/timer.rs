/// The end-of-session notification waiting for its moment.
pub struct ScheduledEnd {
    /// Epoch milliseconds, as JavaScript's `Date.now()` counts them.
    pub at_ms: f64,
    pub title: String,
    pub body: String,
}

/// Empties `slot` and returns its end once `now_ms` has reached it.
pub fn take_due(slot: &mut Option<ScheduledEnd>, now_ms: f64) -> Option<ScheduledEnd> {
    if slot.as_ref()?.at_ms > now_ms {
        return None;
    }
    slot.take()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn end_at(at_ms: f64) -> Option<ScheduledEnd> {
        Some(ScheduledEnd { at_ms, title: "Done".into(), body: "Break".into() })
    }

    #[test]
    fn nothing_scheduled_is_never_due() {
        assert!(take_due(&mut None, 1000.0).is_none());
    }

    #[test]
    fn a_future_end_stays_scheduled() {
        let mut slot = end_at(2000.0);
        assert!(take_due(&mut slot, 1999.0).is_none());
        assert!(slot.is_some());
    }

    #[test]
    fn a_reached_end_fires_once() {
        let mut slot = end_at(2000.0);
        assert_eq!(take_due(&mut slot, 2000.0).map(|end| end.title), Some("Done".to_string()));
        assert!(take_due(&mut slot, 3000.0).is_none());
    }
}
