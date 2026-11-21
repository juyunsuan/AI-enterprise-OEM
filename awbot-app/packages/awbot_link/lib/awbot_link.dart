/// AWBot Link — the companion module that binds this phone to an OEM enterprise account.
///
/// It is a thin, engine-agnostic protocol layer: the app supplies a [PlatformAgent] (the
/// local DSH session) and a [PlatformModelWriter] (the phone's own provider store), and
/// gets pairing, a heartbeat, a serial command queue with streamed receipts, and platform
/// model sync in return.
///
/// Nothing here imports Flutter, the engine or the runtime, so the whole flow runs under
/// `dart test` against a fake transport.
library;

export 'src/agent.dart';
export 'src/api.dart';
export 'src/link.dart';
export 'src/model_sync.dart';
export 'src/models.dart';
export 'src/pairing.dart';
export 'src/runner.dart';
export 'src/store.dart';
export 'src/transport.dart';
