//! Application error type. Errors are serialized to the frontend as
//! `{ code, message }` so the UI can show a translated message for `code`.
use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Sql(#[from] rusqlite::Error),
    #[error("{0}")]
    Json(#[from] serde_json::Error),
    #[error("{0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("{message}")]
    Coded { code: &'static str, message: String },
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn coded(code: &'static str, message: impl Into<String>) -> Self {
        AppError::Coded { code, message: message.into() }
    }

    pub fn code(&self) -> &'static str {
        match self {
            AppError::Io(e) => match e.kind() {
                std::io::ErrorKind::NotFound => "io.not_found",
                std::io::ErrorKind::PermissionDenied => "io.permission_denied",
                std::io::ErrorKind::AlreadyExists => "io.already_exists",
                _ => {
                    // ERROR_SHARING_VIOLATION (32) / ERROR_LOCK_VIOLATION (33) on Windows.
                    if matches!(e.raw_os_error(), Some(32) | Some(33)) {
                        "io.file_in_use"
                    } else if matches!(e.raw_os_error(), Some(28) | Some(112)) {
                        "io.disk_full"
                    } else {
                        "io.error"
                    }
                }
            },
            AppError::Sql(_) => "db.error",
            AppError::Json(_) => "json.invalid",
            AppError::Zip(_) => "backup.zip_invalid",
            AppError::Coded { code, .. } => code,
        }
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut s = serializer.serialize_struct("AppError", 2)?;
        s.serialize_field("code", self.code())?;
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}
