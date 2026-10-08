"""In-memory transactional store for isolated API tests; never loads credentials."""
import copy
import threading


class Snapshot:
    def __init__(self, ref):
        self.reference = ref
        self.id = ref.id
        self._data = copy.deepcopy(ref.db.data.get(ref.path))
        self.exists = self._data is not None

    def to_dict(self):
        return copy.deepcopy(self._data)


class Reference:
    def __init__(self, db, path):
        self.db, self.path = db, path
        self.id = path.rsplit('/', 1)[-1]

    def get(self, transaction=None):
        return Snapshot(self)

    def set(self, data, merge=False):
        self.db.data[self.path] = {**self.db.data.get(self.path, {}), **copy.deepcopy(data)} if merge else copy.deepcopy(data)

    def create(self, data):
        if self.path in self.db.data:
            raise RuntimeError('Already exists')
        self.set(data)

    def update(self, data):
        if self.path not in self.db.data:
            raise RuntimeError('Missing document')
        self.set(data, merge=True)

    def collection(self, name):
        return Collection(self.db, self.path + '/' + name)


class Collection:
    def __init__(self, db, path, filters=None):
        self.db, self.path, self.filters = db, path, filters or []

    def document(self, name):
        return Reference(self.db, self.path + '/' + str(name))

    def where(self, key, op, value):
        return Collection(self.db, self.path, self.filters + [(key, op, value)])

    def stream(self):
        for path, data in list(self.db.data.items()):
            if not path.startswith(self.path + '/') or path.count('/') != self.path.count('/') + 1:
                continue
            if all(data.get(key) == value if op == '==' else data.get(key) in value for key, op, value in self.filters):
                yield Snapshot(Reference(self.db, path))

    def order_by(self, *args, **kwargs):
        return self

    def limit(self, *args):
        return self

    def add(self, data):
        ref = self.document(str(len(self.db.data)))
        ref.create(data)
        return None, ref


class Batch:
    def __init__(self, db):
        self.db, self.operations = db, []

    def create(self, ref, data):
        self.operations.append(('create', ref, data))

    def update(self, ref, data):
        self.operations.append(('update', ref, data))

    def set(self, ref, data, **kwargs):
        # Transactional clinical updates preserve independent draft/history fields.
        if kwargs.get('merge'):
            data = {**self.db.data.get(ref.path, {}), **data}
        self.operations.append(('set', ref, data))

    def commit(self):
        with self.db.lock:
            old = copy.deepcopy(self.db.data)
            try:
                for operation, ref, data in self.operations:
                    if self.db.fail_commit:
                        if isinstance(self.db.fail_commit, Exception):
                            raise self.db.fail_commit
                        raise PermissionError('Simulated commit permission failure')
                    getattr(ref, operation)(data)
            except Exception:
                self.db.data = old
                raise


class Store:
    def __init__(self, data=None):
        self.data = copy.deepcopy(data or {})
        self.lock = threading.RLock()
        self.fail_commit = False

    def collection(self, name):
        return Collection(self, name)

    def batch(self):
        return Batch(self)

    def transaction(self):
        return Batch(self)


def transactional(function):
    def execute(transaction):
        with transaction.db.lock:
            result = function(transaction)
            transaction.commit()
            return result
    return execute
